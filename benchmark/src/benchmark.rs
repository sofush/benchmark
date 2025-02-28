use crate::decode::{DecodedImage, ImageCollection};
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
    coll: ImageCollection,
    sender: Sender<BenchmarkResult>,
) -> anyhow::Result<()> {
    let images: &'static [DecodedImage] = coll.inner();

    for image in images.iter().cycle() {
        let conn = connect_to_server(&config).await?;
        let (mut reader, mut writer) = conn.into_split();
        let mut set = JoinSet::new();
        let timer = Instant::now();

        set.spawn(async move {
            let res = writer
                .write_all(&image.bytes)
                .await
                .map(|_| image.bytes.len());

            res
        });

        set.spawn(async move {
            let mut buf = [0; 65535];
            let mut read = 0;

            loop {
                read += match reader.read(&mut buf).await? {
                    0 => break,
                    n => n,
                }
            }

            Ok(read)
        });

        let results = set
            .join_all()
            .await
            .into_iter()
            .collect::<std::io::Result<Vec<_>>>()?;

        let elapsed = timer.elapsed();

        if results.iter().any(|e| *e != image.bytes.len()) {
            bail!("Read or wrote an incorrect amount of bytes.");
        }

        println!(
            "Transaction for image {} succeeded for {} server, took {:?}.",
            image.filename, config.name, elapsed
        );

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
        let sender_clone = sender.clone();
        set.spawn(async move {
            let benchmark = benchmark_server(c, images, sender_clone).await;
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
