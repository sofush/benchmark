#!/usr/bin/env python3

import socket
import io
from sys import stderr

class BitmapHeader():
    def __init__(self, rw: io.IOBase) -> None:
        header = rw.read(54)
        magic = int.from_bytes(header[0:2], byteorder='little')

        if magic != 0x4d42:
            raise Exception('Invalid magic number.')

        offset = int.from_bytes(header[10:14], byteorder='little')
        remaining = offset - len(header)

        self.header = header
        self.remainder = rw.read(remaining)

    def offset(self) -> int:
        return int.from_bytes(self.header[10:14], byteorder='little')

    def height(self) -> int:
        return int.from_bytes(self.header[22:26], byteorder='little')

    def width(self) -> int:
        return int.from_bytes(self.header[18:22], byteorder='little')

    def bpp(self) -> int:
        return int.from_bytes(self.header[28:30], byteorder='little')

    def compression(self) -> int:
        return int.from_bytes(self.header[30:34], byteorder='little')

    def colors_in_color_table(self) -> int:
        return int.from_bytes(self.header[46:50], byteorder='little')

    def validate(self) -> bool:
        if self.bpp() != 24:
            print('BPP of image is not supported.', file=stderr)
            return False

        if self.compression() != 0:
            print('Image uses compression, which is unsupported.', file=stderr)
            return False

        if self.colors_in_color_table() > 0:
            print('Color table is not empty.', file=stderr)
            return False

        return True

    def write_to(self, rw: io.IOBase) -> None:
        rw.write(self.header)
        rw.write(self.remainder)

def convert_to_greyscale(rw: io.IOBase, bmp: BitmapHeader):
    row_width = 3 * bmp.width()
    padding = ((row_width + 3) & ~3) - row_width

    for _ in range(bmp.height()):
        for _ in range(bmp.width()):
            pixel = rw.read(3)
            grey = int(0.114 * pixel[0] + 0.587 * pixel[1] + 0.299 * pixel[2])
            rw.write(bytes([ grey, grey, grey ]))

        rw.read(padding)

def handle_connection(rw: io.IOBase) -> None | str:
    header = None

    try:
        header = BitmapHeader(rw)
    except Exception as e:
        raise Exception(f'Could not parse BMP header: {e}')

    if not header.validate():
        raise Exception('Could not validate BMP.')

    header.write_to(rw)
    convert_to_greyscale(rw, header)
    rw.write(rw.read())
    rw.flush()

if __name__ == "__main__":
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(('', 5678))
        server.listen()

        print('Waiting for client to connect...')
        sock, _ = server.accept()

        with sock:
            rw = sock.makefile('rwb', buffering=65_536)

            try:
                handle_connection(rw)
            except Exception as e:
                print(e, file=stderr)

            sock.shutdown(socket.SHUT_RDWR)

