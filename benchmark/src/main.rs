use actix_files::Files;
use actix_files::NamedFile;
use actix_web::rt;
use actix_web::{
    middleware, web, App, Error, HttpRequest, HttpResponse, HttpServer,
    Responder,
};
use actix_ws::AggregatedMessage;
use benchmark::BenchmarkResult;
use benchmark::ServerConfig;
use futures_util::pin_mut;
use futures_util::FutureExt;
use futures_util::StreamExt;
use tokio::sync::broadcast::channel;
use tokio::sync::broadcast::Sender;

mod benchmark;
mod decode;

struct AppData {
    sender: Sender<BenchmarkResult>,
}

enum SelectResult {
    WebsocketMessage(AggregatedMessage),
    BroadcastMessage(BenchmarkResult),
    Error(anyhow::Error),
}

async fn websocket(
    req: HttpRequest,
    stream: web::Payload,
    data: web::Data<AppData>,
) -> Result<HttpResponse, Error> {
    let (res, mut session, stream) = actix_ws::handle(&req, stream)?;

    let mut stream = stream
        .aggregate_continuations()
        .max_continuation_size(2_usize.pow(20))
        .fuse();

    let mut receiver = data.sender.subscribe();

    rt::spawn(async move {
        loop {
            let next_ws_message = stream.select_next_some();
            let next_broadcast = receiver.recv().fuse();

            pin_mut!(next_broadcast, next_ws_message);

            let message = futures_util::select! {
                ret = next_ws_message => {
                    match ret {
                        Ok(r) => SelectResult::WebsocketMessage(r),
                        Err(e) => SelectResult::Error(e.into()),
                    }
                },
                ret = next_broadcast => {
                    match ret {
                        Ok(r) => SelectResult::BroadcastMessage(r),
                        Err(e) => SelectResult::Error(e.into()),
                    }
                },
            };

            match message {
                SelectResult::WebsocketMessage(msg) => {
                    if let AggregatedMessage::Close(close_reason) = msg {
                        println!("Websocket disconnected: {close_reason:?}");
                    }
                }
                SelectResult::BroadcastMessage(msg) => {
                    if session
                        .text(serde_json::to_string(&msg).unwrap())
                        .await
                        .is_err()
                    {
                        // session closed
                        break;
                    }
                }
                SelectResult::Error(error) => {
                    println!("Error: {error}");
                }
            }
        }
    });

    Ok(res)
}

async fn index() -> impl Responder {
    NamedFile::open_async("./public/index.html").await.unwrap()
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let (tx, _rx) = channel::<BenchmarkResult>(1_000_000);
    let server_configs = vec![
        ServerConfig {
            name: "rust",
            addr: "127.0.0.1:8081",
        },
        ServerConfig {
            name: "python",
            addr: "127.0.0.1:8082",
        },
    ];

    let tx_clone = tx.clone();

    rt::spawn(async move {
        if let Err(e) = benchmark::start(server_configs, tx_clone).await {
            println!("Encountered error while benchmarking: {e}");
        }
    });

    HttpServer::new(move || {
        let tx_clone = tx.clone();

        App::new()
            .app_data(web::Data::new(AppData { sender: tx_clone }))
            .service(web::resource("/").to(index))
            .service(Files::new("/public", "./public").prefer_utf8(true))
            .service(
                web::resource("/websocket").route(web::get().to(websocket)),
            )
            .wrap(middleware::NormalizePath::trim())
            .wrap(middleware::Logger::default())
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
