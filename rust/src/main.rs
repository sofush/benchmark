use std::{
    io::{BufReader, BufWriter, Read, Write},
    net::{Shutdown, TcpListener},
};

use bitmap_image_header::BitmapImageHeader;

mod bitmap_image_header;

fn convert_to_greyscale<S: Read + Write>(
    reader: &mut BufReader<S>,
    writer: &mut BufWriter<S>,
    bmp: &BitmapImageHeader,
) -> std::io::Result<()> {
    let row_width = 3 * bmp.width() as usize;
    let padding = ((row_width + 3) & !3) - row_width;
    let mut padding_buffer = vec![0u8; padding];
    let mut pixel_buffer = vec![0u8; row_width];

    for _row in 0..bmp.height() {
        reader.read_exact(&mut pixel_buffer)?;

        for col in (0..row_width as usize).step_by(3) {
            let grey = 0.114 * pixel_buffer[col + 0] as f64
                + 0.587 * pixel_buffer[col + 1] as f64
                + 0.299 * pixel_buffer[col + 2] as f64;

            for pixel_component in &mut pixel_buffer[col..col + 3] {
                *pixel_component = grey as u8;
            }
        }

        writer.write_all(&pixel_buffer)?;

        if padding > 0 {
            reader.read_exact(&mut padding_buffer)?;
            writer.write_all(&padding_buffer)?;
        }
    }

    Ok(())
}

fn handle_connection<S: Read + Write>(
    mut reader: BufReader<S>,
    mut writer: BufWriter<S>,
) -> Result<(), String> {
    // Læs header på bitmap billede-fil (.bmp)
    let bmp = match BitmapImageHeader::try_from(&mut reader) {
        Ok(i) => i,
        Err(e) => {
            return Err(format!("Could not parse BMP header: {e}"));
        }
    };

    if !bmp.validate() {
        return Err("Could not validate BMP.".to_string());
    }

    #[cfg(debug_assertions)]
    {
        dbg!(bmp.height());
        dbg!(bmp.width());
        dbg!(bmp.bpp());
        dbg!(bmp.colors_in_color_table());
        dbg!(bmp.compression());
        dbg!(bmp.offset());
    }

    // Send header tilbage til klienten.
    if let Err(e) = bmp.write_to(&mut writer) {
        return Err(format!("Could not write header to client: {e}"));
    }

    // Konverter hver pixel til gråtoner.
    if let Err(e) = convert_to_greyscale(&mut reader, &mut writer, &bmp) {
        return Err(format!("Could not convert BMP to greyscale: {e}"));
    }

    // Send resten af filen tilbage klienten.
    let mut buffer = [0u8; 8192];

    loop {
        match reader.read(&mut buffer) {
            Ok(0) => {
                break;
            }
            Ok(n) => {
                if let Err(e) = writer.write_all(&buffer[..n]) {
                    return Err(format!("Could not write to TCP stream: {e}"));
                }
            }
            Err(e) => {
                return Err(format!("Could not read from TCP stream: {e}"))
            }
        }
    }

    if let Err(e) = writer.flush() {
        return Err(format!("Could not flush TCP stream: {e}"));
    };

    Ok(())
}

fn main() {
    let server = match TcpListener::bind("127.0.0.1:8081") {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Could not create TcpListener: {e}");
            return;
        }
    };

    loop {
        println!("Waiting for client to connect...");

        match server.accept() {
            Ok((stream, _)) => {
                let writer = {
                    let Ok(stream_clone) = stream.try_clone() else {
                        eprintln!("Could not clone TCP stream.");
                        return;
                    };

                    BufWriter::with_capacity(65_536, stream_clone)
                };
                let reader = {
                    let Ok(stream_clone) = stream.try_clone() else {
                        eprintln!("Could not clone TCP stream.");
                        return;
                    };
                    BufReader::with_capacity(65_536, stream_clone)
                };

                if let Err(e) = handle_connection(reader, writer) {
                    eprintln!("Error: {e}");
                }

                if let Err(e) = stream.shutdown(Shutdown::Both) {
                    eprintln!("Could not shutdown stream: {e}");
                }
            }
            Err(e) => println!("Could not get client: {e}"),
        }
    }
}
