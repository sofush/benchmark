use image::{ImageFormat, ImageReader};
use std::{io::Cursor, path::PathBuf};
use tokio::task::JoinSet;

pub struct DecodedImage {
    pub filename: String,
    pub bytes: Vec<u8>,
}

impl DecodedImage {
    fn decode(path: PathBuf) -> anyhow::Result<Self> {
        println!("Opening image: {path:?}");
        let image = ImageReader::open(&path)?
            .decode()
            .expect("files in this directory should be decodable images");

        let mut bmp = vec![];
        let mut cursor = Cursor::new(&mut bmp);

        println!("Writing image to buffer: {path:?}");
        image
            .write_to(&mut cursor, ImageFormat::Bmp)
            .expect("image should be writable to vec");

        Ok(Self {
            filename: path
                .file_name()
                .map(|os_str| os_str.to_string_lossy().to_string())
                .unwrap_or("?".into()),
            bytes: bmp,
        })
    }
}

#[derive(Clone, Copy)]
pub struct ImageCollection {
    images: &'static [DecodedImage],
}

impl ImageCollection {
    pub async fn new() -> anyhow::Result<Self> {
        let mut set: JoinSet<anyhow::Result<DecodedImage>> = JoinSet::new();

        for entry in std::fs::read_dir("./images")? {
            set.spawn_blocking(move || DecodedImage::decode(entry?.path()));
        }

        let mut images = vec![];

        while let Some(res) = set.join_next().await {
            images.push(res??);
        }

        images.sort_by(|a, b| {
            let a_num: Option<Result<usize, _>> = a
                .filename
                .split_once('.')
                .map(|(l, _)| l)
                .map(|s| s.parse());
            let b_num: Option<Result<usize, _>> = b
                .filename
                .split_once('.')
                .map(|(l, _)| l)
                .map(|s| s.parse());

            if let (Some(Ok(a_num)), Some(Ok(b_num))) = (a_num, b_num) {
                return a_num.cmp(&b_num);
            }

            eprintln!(
                "Error: could not sort images by filename: {} and {}.",
                a.filename, b.filename
            );
            a.filename.cmp(&b.filename)
        });

        Ok(Self {
            images: images.leak(),
        })
    }

    pub fn inner(&self) -> &'static [DecodedImage] {
        self.images
    }
}
