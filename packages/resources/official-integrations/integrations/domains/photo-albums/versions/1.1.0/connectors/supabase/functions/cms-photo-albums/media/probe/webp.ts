import {
    ascii,
    exifOrientation,
    malformed,
    matches,
    readU16LE,
    readU24LE,
    readU32LE,
    requireBytes,
    unsupportedAnimation,
} from "./bytes.ts";
import type { ImageDimensions } from "./types.ts";

export function isWebp(bytes: Uint8Array): boolean {
    return bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
}

export function webpDimensions(bytes: Uint8Array): ImageDimensions {
    requireBytes(bytes, 0, 20);
    if (!isWebp(bytes) || readU32LE(bytes, 4) + 8 !== bytes.length) {
        malformed();
    }
    let offset = 12;
    let canvas: ImageDimensions | null = null;
    let frame: ImageDimensions | null = null;
    let orientation = 1;
    while (offset < bytes.length) {
        requireBytes(bytes, offset, 8);
        const kind = ascii(bytes, offset, 4);
        const length = readU32LE(bytes, offset + 4);
        const payload = offset + 8;
        requireBytes(bytes, payload, length);
        if (kind === "ANIM" || kind === "ANMF") {
            unsupportedAnimation();
        }
        if (kind === "EXIF") {
            orientation = exifOrientation(bytes.subarray(payload, payload + length)) ?? orientation;
        }
        if (kind === "VP8X") {
            if (canvas || length !== 10) {
                malformed();
            }
            if (bytes[payload]! & 0x02) {
                unsupportedAnimation();
            }
            canvas = {
                width: readU24LE(bytes, payload + 4) + 1,
                height: readU24LE(bytes, payload + 7) + 1,
            };
        } else if (kind === "VP8L" || kind === "VP8 ") {
            if (frame) {
                malformed();
            }
            frame =
                kind === "VP8L" ? losslessDimensions(bytes, payload, length) : lossyDimensions(bytes, payload, length);
        }
        offset = payload + length + (length % 2);
        requireBytes(bytes, 0, offset);
    }
    if (offset !== bytes.length || !frame) {
        malformed();
    }
    if (canvas && (canvas.width !== frame.width || canvas.height !== frame.height)) {
        malformed();
    }
    const dimensions = canvas ?? frame;
    return orientation >= 5 && orientation <= 8 ? { width: dimensions.height, height: dimensions.width } : dimensions;
}

function losslessDimensions(bytes: Uint8Array, payload: number, length: number): ImageDimensions {
    if (length < 5 || bytes[payload] !== 0x2f) {
        malformed();
    }
    const bits = readU32LE(bytes, payload + 1);
    return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
    };
}

function lossyDimensions(bytes: Uint8Array, payload: number, length: number): ImageDimensions {
    if (length < 10 || !matches(bytes, payload + 3, [0x9d, 0x01, 0x2a])) {
        malformed();
    }
    return {
        width: readU16LE(bytes, payload + 6) & 0x3fff,
        height: readU16LE(bytes, payload + 8) & 0x3fff,
    };
}
