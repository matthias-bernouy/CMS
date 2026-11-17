import { deflateSync } from "node:zlib";

/** Deterministic valid raster data; no external asset or image-generation service is needed. */
export function pngFixture(width = 64, height = 64): Uint8Array {
    if (![width, height].every((value) => Number.isSafeInteger(value) && value >= 1 && value <= 512)) {
        throw new Error("PNG fixtures are bounded to 512 × 512 pixels");
    }
    const pixels = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * (width * 4 + 1) + 1 + x * 4;
            pixels[index] = (x * 17) % 256;
            pixels[index + 1] = (y * 29) % 256;
            pixels[index + 2] = ((x + y) * 31) % 256;
            pixels[index + 3] = 255;
        }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", header),
        chunk("IDAT", deflateSync(pixels)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

function chunk(type: string, bytes: Uint8Array): Buffer {
    const content = Buffer.concat([Buffer.from(type, "ascii"), bytes]);
    let checksum = 0xffffffff;
    for (const value of content) {
        checksum ^= value;
        for (let bit = 0; bit < 8; bit++) {
            checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
        }
    }
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.byteLength);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((checksum ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, content, crc]);
}
