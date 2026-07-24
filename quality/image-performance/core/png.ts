import { deflateSync } from "node:zlib";

export function syntheticPng(width: number, height: number, seed: number): Uint8Array {
    const rowSize = width * 3 + 1;
    const raw = new Uint8Array(rowSize * height);
    for (let y = 0; y < height; y++) {
        const row = y * rowSize;
        raw[row] = 0;
        for (let x = 0; x < width; x++) {
            const offset = row + 1 + x * 3;
            raw[offset] = (x * 13 + y * 3 + seed * 17) % 256;
            raw[offset + 1] = (x * 5 + y * 11 + seed * 29) % 256;
            raw[offset + 2] = (x * 7 + y * 19 + seed * 31) % 256;
        }
    }
    return concat(
        signature(),
        chunk("IHDR", ihdr(width, height)),
        chunk("IDAT", deflateSync(raw)),
        chunk("IEND", new Uint8Array()),
    );
}

function signature(): Uint8Array {
    return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
}

function ihdr(width: number, height: number): Uint8Array {
    const value = new Uint8Array(13);
    const view = new DataView(value.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    value.set([8, 2, 0, 0, 0], 8);
    return value;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
    const typeBytes = new TextEncoder().encode(type);
    const result = new Uint8Array(data.length + 12);
    const view = new DataView(result.buffer);
    view.setUint32(0, data.length);
    result.set(typeBytes, 4);
    result.set(data, 8);
    view.setUint32(data.length + 8, crc32(concat(typeBytes, data)));
    return result;
}

function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function concat(...parts: Uint8Array[]): Uint8Array {
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}
