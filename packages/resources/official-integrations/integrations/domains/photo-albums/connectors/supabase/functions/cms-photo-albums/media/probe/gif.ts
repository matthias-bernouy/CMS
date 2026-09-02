import { ascii, malformed, readU16LE, requireBytes, unsupportedAnimation } from "./bytes.ts";
import type { ImageDimensions } from "./types.ts";

export function isGif(bytes: Uint8Array): boolean {
    const header = bytes.length >= 6 ? ascii(bytes, 0, 6) : "";
    return header === "GIF87a" || header === "GIF89a";
}

export function gifDimensions(bytes: Uint8Array): ImageDimensions {
    requireBytes(bytes, 0, 13);
    if (!isGif(bytes)) {
        malformed();
    }
    const dimensions = { width: readU16LE(bytes, 6), height: readU16LE(bytes, 8) };
    let offset = 13 + colorTableLength(bytes[10]!);
    requireBytes(bytes, 0, offset);
    let frames = 0;
    while (offset < bytes.length) {
        const marker = bytes[offset++]!;
        if (marker === 0x3b) {
            if (frames !== 1 || offset !== bytes.length) {
                malformed();
            }
            return dimensions;
        }
        if (marker === 0x21) {
            requireBytes(bytes, offset, 1);
            offset = skipSubBlocks(bytes, offset + 1, false);
            continue;
        }
        if (marker !== 0x2c) {
            malformed();
        }
        frames++;
        if (frames > 1) {
            unsupportedAnimation();
        }
        requireBytes(bytes, offset, 9);
        const left = readU16LE(bytes, offset);
        const top = readU16LE(bytes, offset + 2);
        const width = readU16LE(bytes, offset + 4);
        const height = readU16LE(bytes, offset + 6);
        if (!width || !height || left + width > dimensions.width || top + height > dimensions.height) {
            malformed();
        }
        offset += 9;
        offset += colorTableLength(bytes[offset - 1]!);
        requireBytes(bytes, offset, 1);
        const minimumCodeSize = bytes[offset++]!;
        if (minimumCodeSize < 2 || minimumCodeSize > 8) {
            malformed();
        }
        offset = skipSubBlocks(bytes, offset, true);
    }
    malformed();
}

function colorTableLength(packed: number): number {
    return packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0;
}

function skipSubBlocks(bytes: Uint8Array, start: number, requireData: boolean): number {
    let offset = start;
    let dataBytes = 0;
    while (offset < bytes.length) {
        const length = bytes[offset++]!;
        if (length === 0) {
            if (requireData && dataBytes === 0) {
                malformed();
            }
            return offset;
        }
        requireBytes(bytes, offset, length);
        dataBytes += length;
        offset += length;
    }
    malformed();
}
