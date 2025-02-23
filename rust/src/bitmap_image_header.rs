use std::io::{BufReader, BufWriter, Read, Write};

#[derive(Debug, Clone)]
pub struct BitmapImageHeader {
    pub header: [u8; 52],
    pub remainder: Vec<u8>,
}

impl BitmapImageHeader {
    pub fn offset(&self) -> usize {
        let num = self.header[10..14].try_into().unwrap();
        u32::from_le_bytes(num) as usize
    }

    pub fn height(&self) -> i32 {
        let num = self.header[22..26].try_into().unwrap();
        i32::from_le_bytes(num)
    }

    pub fn width(&self) -> i32 {
        let num = self.header[18..22].try_into().unwrap();
        i32::from_le_bytes(num)
    }

    pub fn bpp(&self) -> usize {
        let num = self.header[28..30].try_into().unwrap();
        u16::from_le_bytes(num) as usize
    }

    pub fn compression(&self) -> usize {
        let num = self.header[30..34].try_into().unwrap();
        u32::from_le_bytes(num) as usize
    }

    pub fn colors_in_color_table(&self) -> usize {
        let num = self.header[46..50].try_into().unwrap();
        u32::from_le_bytes(num) as usize
    }

    pub fn validate(&self) -> bool {
        if self.bpp() != 24 {
            eprintln!("BPP of image is not supported.");
            return false;
        }

        if self.compression() != 0 {
            eprintln!("Image uses compression, which is unsupported.");
            return false;
        }

        if self.colors_in_color_table() > 0 {
            eprintln!("Color table is not empty.");
            return false;
        }

        true
    }

    pub fn write_to<S: Write>(
        &self,
        writer: &mut BufWriter<S>,
    ) -> std::io::Result<()> {
        writer.write_all(&self.header)?;
        writer.write_all(&self.remainder)
    }
}

impl<S: Read> TryFrom<&mut BufReader<S>> for BitmapImageHeader {
    type Error = &'static str;

    fn try_from(stream: &mut BufReader<S>) -> Result<Self, Self::Error> {
        let mut header = [0u8; 52];

        if stream.read_exact(&mut header).is_err() {
            return Err("Could not read BMP header.");
        }

        let magic = header[0..2].try_into().unwrap();

        if u16::from_le_bytes(magic) != 0x4d42 {
            return Err("Invalid magic number.");
        }

        let offset = header[10..14].try_into().unwrap();
        let offset: usize = u32::from_le_bytes(offset).try_into().unwrap();

        let remaining = offset - header.len();
        let mut remainder = vec![0u8; remaining];

        if stream.read_exact(&mut remainder).is_err() {
            return Err("Could not read BMP header.");
        }

        Ok(Self { header, remainder })
    }
}
