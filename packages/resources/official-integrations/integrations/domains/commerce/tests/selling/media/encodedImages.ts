import { deflateSync } from "node:zlib";

const encoder = new TextEncoder();
const jpeg = decodeBase64(
    "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCIAUgIf//Z",
);
const gif = decodeBase64("R0lGODlhAwACAIAAAExpcRRkyCH5BAUAAAAALAAAAAADAAIAAAICjF8AOw==");
const webp = decodeBase64(
    "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoDAAIAAUAmJaACdLoB+AADsAD+8JtD/2Dv5wH5wH9MH/5+ZfLfvjMAAAA=",
);
const avif = decodeBase64(
    "AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAAXBtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAANGlsb2MAAAAAREAAAgABAAAAAAGUAAEAAAAAAAAAHQACAAAAAAGxAAEAAAAAAAAAFQAAADhpaW5mAAAAAAACAAAAFWluZmUCAAAAAAEAAGF2MDEAAAAAFWluZmUCAAAAAAIAAGF2MDEAAAAAr2lwcnAAAACKaXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAMAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAcAAAAAA5waXhpAAAAAAEIAAAAOGF1eEMAAAAAdXJuOm1wZWc6bXBlZ0I6Y2ljcDpzeXN0ZW1zOmF1eGlsaWFyeTphbHBoYQAAAAAdaXBtYQAAAAAAAAACAAEDgQIDAAIEhAIFhgAAABppcmVmAAAAAAAAAA5hdXhsAAIAAQABAAAAOm1kYXQSAAoIOAQrCAhoNIAyDxgAAABAALATZRb25u7YAhIACgUYBCsKgDIKGAAAAQACIRujYA==",
);
const orientedWebp = decodeBase64(
    "UklGRvgCAABXRUJQVlA4WAoAAAAoAAAACwAABwAASUNDUOABAAAAAAHgbGNtcwQgAABtbnRyUkdCIFhZWiAH4gADABQACQAOAB1hY3NwTVNGVAAAAABzYXdzY3RybAAAAAAAAAAAAAAAAAAA9tYAAQAAAADTLWhhbmR56b9WWj4BtoMjhVVG90+qAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAApkZXNjAAAA/AAAACRjcHJ0AAABIAAAACJ3dHB0AAABRAAAABRjaGFkAAABWAAAACxyWFlaAAABhAAAABRnWFlaAAABmAAAABRiWFlaAAABrAAAABRyVFJDAAABwAAAACBnVFJDAAABwAAAACBiVFJDAAABwAAAACBtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAYAAAAcAEMAQwAwAABYWVogAAAAAAAA9tYAAQAAAADTLXNmMzIAAAAAAAEMPwAABd3///MmAAAHkAAA/ZL///uh///9ogAAA9wAAMBxWFlaIAAAAAAAAG+gAAA48gAAA49YWVogAAAAAAAAYpYAALeJAAAY2lhZWiAAAAAAAAAkoAAAD4UAALbEcGFyYQAAAAAAAwAAAAJmaQAA8qcAAA1ZAAAT0AAACltWUDggMAAAANABAJ0BKgwACAABQCYloAJ0ugH4AAOwAP7y63/82BXNc+/3/9Lg/S4P0uD/0pAAAEVYSUa6AAAARXhpZgAASUkqAAgAAAAGABIBAwABAAAABgAAABoBBQABAAAAVgAAABsBBQABAAAAXgAAACgBAwABAAAAAgAAABMCAwABAAAAAQAAAGmHBAABAAAAZgAAAAAAAAA4YwAA6AMAADhjAADoAwAABgAAkAcABAAAADAyMTABkQcABAAAAAECAwAAoAcABAAAADAxMDABoAMAAQAAAP//AAACoAQAAQAAAAwAAAADoAQAAQAAAAgAAAAAAAAA",
);
const orientedAvif = decodeBase64(
    "AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAAw5tZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAANGlsb2MAAAAAREAAAgABAAAAAAMyAAEAAAAAAAAAHgACAAAAAANQAAEAAAAAAAAAvgAAADhpaW5mAAAAAAACAAAAFWluZmUCAAAAAAEAAGF2MDEAAAAAFWluZmUCAAABAAIAAEV4aWYAAAACTWlwcnAAAAItaXBjbwAAAAxhdjFDgSACAAAAAexjb2xycklDQwAAAeBsY21zBCAAAG1udHJSR0IgWFlaIAfiAAMAFAAJAA4AHWFjc3BNU0ZUAAAAAHNhd3NjdHJsAAAAAAAAAAAAAAAAAAD21gABAAAAANMtaGFuZHnpv1ZaPgG2gyOFVUb3T6oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACmRlc2MAAAD8AAAAJGNwcnQAAAEgAAAAInd0cHQAAAFEAAAAFGNoYWQAAAFYAAAALHJYWVoAAAGEAAAAFGdYWVoAAAGYAAAAFGJYWVoAAAGsAAAAFHJUUkMAAAHAAAAAIGdUUkMAAAHAAAAAIGJUUkMAAAHAAAAAIG1sdWMAAAAAAAAAAQAAAAxlblVTAAAACAAAABwAcwBSAEcAQm1sdWMAAAAAAAAAAQAAAAxlblVTAAAABgAAABwAQwBDADAAAFhZWiAAAAAAAAD21gABAAAAANMtc2YzMgAAAAAAAQw/AAAF3f//8yYAAAeQAAD9kv//+6H///2iAAAD3AAAwHFYWVogAAAAAAAAb6AAADjyAAADj1hZWiAAAAAAAABilgAAt4kAABjaWFlaIAAAAAAAACSgAAAPhQAAtsRwYXJhAAAAAAADAAAAAmZpAADypwAADVkAABPQAAAKWwAAABRpc3BlAAAAAAAAAAwAAAAIAAAAEHBpeGkAAAAAAwgICAAAAAlpcm90AwAAABhpcG1hAAAAAAAAAAEAAQWBAgMEhQAAABppcmVmAAAAAAAAAA5jZHNjAAIAAQABAAAA5G1kYXQSAAoIOAyvsICGg0gyEBgAAABAAMNe0zUA+3lP5+gAAAAGRXhpZgAASUkqAAgAAAAGABIBAwABAAAABgAAABoBBQABAAAAVgAAABsBBQABAAAAXgAAACgBAwABAAAAAgAAABMCAwABAAAAAQAAAGmHBAABAAAAZgAAAAAAAAA4YwAA6AMAADhjAADoAwAABgAAkAcABAAAADAyMTABkQcABAAAAAECAwAAoAcABAAAADAxMDABoAMAAQAAAP//AAACoAQAAQAAAAwAAAADoAQAAQAAAAgAAAAAAAAA",
);

export function pngBytes(width = 320, height = 200): Uint8Array {
    return encodedPng(width, height);
}

export function pngWithAncillaryBytes(byteLength: number): Uint8Array {
    const still = encodedPng(320, 200);
    const payload = new Uint8Array(byteLength);
    payload.fill(0x61);
    payload.set(encoder.encode("Comment\0"));
    const afterHeader = 8 + 12 + 13;
    return concat([still.subarray(0, afterHeader), pngChunk("tEXt", payload), still.subarray(afterHeader)]);
}

export function orientedPngBytes(): Uint8Array {
    return encodedPng(12, 8, 6);
}

export function animatedPngBytes(): Uint8Array {
    const still = encodedPng(3, 2);
    const animationControl = new Uint8Array(8);
    writeU32BE(animationControl, 0, 2);
    const afterHeader = 8 + 12 + 13;
    return concat([still.subarray(0, afterHeader), pngChunk("acTL", animationControl), still.subarray(afterHeader)]);
}

function encodedPng(width: number, height: number, orientation?: number): Uint8Array {
    const rowBytes = Math.ceil(Math.max(0, width) / 8);
    const raw = new Uint8Array((rowBytes + 1) * Math.max(0, height));
    const header = new Uint8Array(13);
    writeU32BE(header, 0, width);
    writeU32BE(header, 4, height);
    header.set([1, 0, 0, 0, 0], 8);
    return concat([
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk("IHDR", header),
        ...(orientation ? [pngChunk("eXIf", tiffOrientation(orientation))] : []),
        pngChunk("IDAT", new Uint8Array(deflateSync(raw))),
        pngChunk("IEND", new Uint8Array()),
    ]);
}

export function jpegBytes(orientation = 1): Uint8Array {
    if (orientation === 1) {
        return jpeg.slice();
    }
    return concat([jpeg.subarray(0, 2), jpegExif(orientation), jpeg.subarray(2)]);
}

export function gifBytes(): Uint8Array {
    return gif.slice();
}

export function webpBytes(): Uint8Array {
    return webp.slice();
}

export function avifBytes(): Uint8Array {
    return avif.slice();
}

export function orientedWebpBytes(): Uint8Array {
    return orientedWebp.slice();
}

export function orientedAvifBytes(): Uint8Array {
    return orientedAvif.slice();
}

export function animatedGifBytes(): Uint8Array {
    const frameStart = gif.indexOf(0x2c);
    return concat([gif.subarray(0, frameStart), gif.subarray(frameStart, -1), gif.subarray(frameStart)]);
}

export function animatedWebpBytes(): Uint8Array {
    const extended = new Uint8Array(10);
    extended[0] = 0x02;
    writeU24LE(extended, 4, 2);
    writeU24LE(extended, 7, 1);
    const body = concat([encoder.encode("WEBP"), riffChunk("VP8X", extended), webp.subarray(12)]);
    return concat([encoder.encode("RIFF"), littleU32(body.length), body]);
}

export function animatedAvifBytes(): Uint8Array {
    const result = avif.slice();
    result.set(encoder.encode("avis"), 8);
    return result;
}

function jpegExif(orientation: number): Uint8Array {
    const payload = concat([encoder.encode("Exif\0\0"), tiffOrientation(orientation)]);
    return concat([new Uint8Array([0xff, 0xe1, 0, payload.length + 2]), payload]);
}

function tiffOrientation(orientation: number): Uint8Array {
    return concat([
        encoder.encode("II"),
        new Uint8Array([42, 0, 8, 0, 0, 0, 1, 0]),
        new Uint8Array([0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0]),
        new Uint8Array(4),
    ]);
}

function pngChunk(type: string, payload: Uint8Array): Uint8Array {
    const content = concat([encoder.encode(type), payload]);
    return concat([bigU32(payload.length), content, bigU32(crc32(content))]);
}

function riffChunk(type: string, payload: Uint8Array): Uint8Array {
    return concat([encoder.encode(type), littleU32(payload.length), payload, new Uint8Array(payload.length % 2)]);
}

function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function bigU32(value: number): Uint8Array {
    const bytes = new Uint8Array(4);
    writeU32BE(bytes, 0, value);
    return bytes;
}

function littleU32(value: number): Uint8Array {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, true);
    return bytes;
}

function writeU32BE(bytes: Uint8Array, offset: number, value: number): void {
    new DataView(bytes.buffer, bytes.byteOffset + offset, 4).setUint32(0, value, false);
}

function writeU24LE(bytes: Uint8Array, offset: number, value: number): void {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
}

function decodeBase64(value: string): Uint8Array {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function concat(values: Uint8Array[]): Uint8Array {
    const result = new Uint8Array(values.reduce((total, value) => total + value.byteLength, 0));
    let offset = 0;
    for (const value of values) {
        result.set(value, offset);
        offset += value.byteLength;
    }
    return result;
}
