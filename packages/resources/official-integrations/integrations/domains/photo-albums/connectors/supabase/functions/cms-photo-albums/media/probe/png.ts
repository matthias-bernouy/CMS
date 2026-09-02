import { ascii, exifOrientation, malformed, matches, readU32BE, requireBytes, unsupportedAnimation } from "./bytes.ts";
import type { ImageDimensions } from "./types.ts";

const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const crc32Table = buildCrc32Table();

function buildCrc32Table(): Readonly<Uint32Array> {
    const table = new Uint32Array(256);
    for (let value = 0; value < table.length; value++) {
        let crc = value;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
        table[value] = crc >>> 0;
    }
    return table;
}

export function isPng(bytes: Uint8Array): boolean {
    return matches(bytes, 0, signature);
}

export function pngDimensions(bytes: Uint8Array): ImageDimensions {
    if (!isPng(bytes)) {
        malformed();
    }
    let offset = signature.length;
    let dimensions: ImageDimensions | null = null;
    let sawImageData = false;
    let imageDataEnded = false;
    let orientation = 1;
    while (offset < bytes.length) {
        requireBytes(bytes, offset, 12);
        const length = readU32BE(bytes, offset);
        const type = ascii(bytes, offset + 4, 4);
        const payload = offset + 8;
        const end = payload + length;
        requireBytes(bytes, payload, length + 4);
        if (crc32(bytes.subarray(offset + 4, end)) !== readU32BE(bytes, end)) {
            malformed();
        }
        if (type === "IHDR") {
            if (dimensions || offset !== signature.length || length !== 13) {
                malformed();
            }
            dimensions = readHeader(bytes, payload);
        } else if (type === "acTL") {
            unsupportedAnimation();
        } else if (type === "eXIf") {
            orientation = exifOrientation(bytes.subarray(payload, end)) ?? orientation;
        } else if (type === "IDAT") {
            if (!dimensions || imageDataEnded || length === 0) {
                malformed();
            }
            sawImageData = true;
        } else if (sawImageData && type !== "IEND") {
            imageDataEnded = true;
        }
        offset = end + 4;
        if (type === "IEND") {
            if (length !== 0 || !dimensions || !sawImageData || offset !== bytes.length) {
                malformed();
            }
            return orientation >= 5 && orientation <= 8
                ? { width: dimensions.height, height: dimensions.width }
                : dimensions;
        }
    }
    malformed();
}

function readHeader(bytes: Uint8Array, offset: number): ImageDimensions {
    const bitDepth = bytes[offset + 8]!;
    const colorType = bytes[offset + 9]!;
    const allowedDepths: Record<number, readonly number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
    };
    if (
        !allowedDepths[colorType]?.includes(bitDepth) ||
        bytes[offset + 10] !== 0 ||
        bytes[offset + 11] !== 0 ||
        (bytes[offset + 12] !== 0 && bytes[offset + 12] !== 1)
    ) {
        malformed();
    }
    return { width: readU32BE(bytes, offset), height: readU32BE(bytes, offset + 4) };
}

function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index++) {
        crc = crc32Table[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
