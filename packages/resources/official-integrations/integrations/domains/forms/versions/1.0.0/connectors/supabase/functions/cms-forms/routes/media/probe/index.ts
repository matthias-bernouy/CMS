import { HttpError } from "../../../http.ts";
import { maxFormImagePixels } from "../constants.ts";
import { ascii, malformed, matches, readU16BE, readU16LE, readU24LE, readU32BE, readU32LE } from "./bytes.ts";

export type ProbedImage = {
    extension: string;
    height: number;
    mimeType: string;
    width: number;
};

export function probeFormImage(bytes: Uint8Array): ProbedImage {
    const image = detect(bytes);
    if (!image.width || !image.height || image.width * image.height > maxFormImagePixels) {
        throw new HttpError(400, "image dimensions are invalid or too large");
    }
    return image;
}

function detect(bytes: Uint8Array): ProbedImage {
    if (matches(bytes, 0, [0xff, 0xd8, 0xff])) {
        return { ...jpegDimensions(bytes), extension: ".jpg", mimeType: "image/jpeg" };
    }
    if (matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return { width: readU32BE(bytes, 16), height: readU32BE(bytes, 20), extension: ".png", mimeType: "image/png" };
    }
    if (bytes.length >= 10 && ["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6))) {
        return { width: readU16LE(bytes, 6), height: readU16LE(bytes, 8), extension: ".gif", mimeType: "image/gif" };
    }
    if (bytes.length >= 30 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
        return { ...webpDimensions(bytes), extension: ".webp", mimeType: "image/webp" };
    }
    throw new HttpError(400, "file must be a JPEG, PNG, WebP, or GIF image");
}

function jpegDimensions(bytes: Uint8Array): { height: number; width: number } {
    let offset = 2;
    while (offset + 4 < bytes.length) {
        if (bytes[offset++] !== 0xff) {
            malformed();
        }
        while (bytes[offset] === 0xff) {
            offset++;
        }
        const marker = bytes[offset++]!;
        if (marker === 0xd9 || marker === 0xda) {
            break;
        }
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            continue;
        }
        const length = readU16BE(bytes, offset);
        if (length < 2 || offset + length > bytes.length) {
            malformed();
        }
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
            return { height: readU16BE(bytes, offset + 3), width: readU16BE(bytes, offset + 5) };
        }
        offset += length;
    }
    malformed();
}

function webpDimensions(bytes: Uint8Array): { height: number; width: number } {
    if (readU32LE(bytes, 4) + 8 !== bytes.length) {
        malformed();
    }
    const kind = ascii(bytes, 12, 4);
    if (kind === "VP8X") {
        return { width: readU24LE(bytes, 24) + 1, height: readU24LE(bytes, 27) + 1 };
    }
    if (kind === "VP8L" && bytes[20] === 0x2f) {
        const bits = readU32LE(bytes, 21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (kind === "VP8 " && matches(bytes, 23, [0x9d, 0x01, 0x2a])) {
        return { width: readU16LE(bytes, 26) & 0x3fff, height: readU16LE(bytes, 28) & 0x3fff };
    }
    malformed();
}
