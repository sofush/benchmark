use crate::decode::ImageCollection;
use anyhow::bail;
use serde::{Deserialize, Serialize};
use std::{
    io::ErrorKind,
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    sync::broadcast::Sender,
    task::JoinSet,
};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct BenchmarkResult {
    pub server: &'static str,
    pub filename: String,
    pub elapsed: Duration,
}

#[derive(Clone, Copy)]
pub struct ServerConfig {
    pub name: &'static str,
    pub addr: &'static str,
}

async fn connect_to_server(config: &ServerConfig) -> anyhow::Result<TcpStream> {
    let try_again = |kind: std::io::ErrorKind| {
        matches!(kind, ErrorKind::Interrupted | ErrorKind::ConnectionRefused)
    };

    loop {
        return match TcpStream::connect(config.addr).await {
            Ok(s) => Ok(s),
            Err(e) if try_again(e.kind()) => {
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            }
            Err(e) => Err(e.into()),
        };
    }
}

async fn benchmark_server(
    config: ServerConfig,
    images: ImageCollection,
    sender: Sender<BenchmarkResult>,
) -> anyhow::Result<()> {
    for image in images.iter().cycle() {
        let mut conn = connect_to_server(&config).await?;
        let before = Instant::now();
        println!(
            "Writing image {} to {} server.",
            image.filename, config.name
        );
        conn.write_all(&image.bytes).await?;
        conn.shutdown().await?;

        let expected_len = image.bytes.len();
        let mut output = Vec::with_capacity(expected_len);
        println!(
            "Reading greyscale image {} from {} server.",
            image.filename, config.name
        );
        conn.read_to_end(&mut output).await?;
        let elapsed = Instant::now() - before;

        println!(
            "Transaction for image {} succeeded for {} server, took {:?}.",
            image.filename, config.name, elapsed
        );

        if output.len() != expected_len {
            bail!("Expected {expected_len} bytes, received {}", output.len());
        }

        sender.send(BenchmarkResult {
            server: config.name,
            filename: image.filename.clone(),
            elapsed,
        })?;
    }

    Ok(())
}

pub async fn start(
    configs: Vec<ServerConfig>,
    sender: Sender<BenchmarkResult>,
) -> anyhow::Result<()> {
    println!("Decoding images...");
    let images = ImageCollection::new().await?;
    let mut set = JoinSet::new();

    for c in configs {
        println!("Starting benchmark for {} server.", c.name);
        let images_clone = images.clone();
        let sender_clone = sender.clone();
        set.spawn(async move {
            let benchmark =
                benchmark_server(c, images_clone, sender_clone).await;
            (c, benchmark)
        });
    }

    while let Some(benchmark) = set.join_next().await {
        let Ok((config, benchmark)) = benchmark else {
            println!("Could not join on benchmark future.");
            break;
        };

        match benchmark {
            Ok(_) => println!("Finished benchmark for {} server.", config.name),
            Err(e) => {
                println!("Benchmark failed for {} server: {e}", config.name)
            }
        }
    }

    Ok(())
}
