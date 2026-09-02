import { HttpError } from "../../../../core/errors.ts";

export function ascii(bytes: Uint8Array, offset: number, length: number): string {
    if (offset < 0 || length < 0 || offset + length > bytes.length) {
        malformed();
    }
    return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

export function matches(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
    return expected.every((byte, index) => bytes[offset + index] === byte);
}

export function readU16BE(bytes: Uint8Array, offset: number): number {
    requireBytes(bytes, offset, 2);
    return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

export function readU16LE(bytes: Uint8Array, offset: number): number {
    requireBytes(bytes, offset, 2);
    return bytes[offset]! | (bytes[offset + 1]! << 8);
}

export function readU24LE(bytes: Uint8Array, offset: number): number {
    requireBytes(bytes, offset, 3);
    return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

export function readU32BE(bytes: Uint8Array, offset: number): number {
    requireBytes(bytes, offset, 4);
    return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

export function readU32LE(bytes: Uint8Array, offset: number): number {
    requireBytes(bytes, offset, 4);
    return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

export function readU64BE(bytes: Uint8Array, offset: number): number {
    requireBytes(bytes, offset, 8);
    const value = new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, false);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
        malformed();
    }
    return Number(value);
}

export function requireBytes(bytes: Uint8Array, offset: number, length: number): void {
    if (offset < 0 || length < 0 || offset + length > bytes.length) {
        malformed();
    }
}

export function malformed(): never {
    throw new HttpError(400, "file is not a valid supported image");
}

export function unsupportedAnimation(): never {
    throw new HttpError(400, "animated images are not supported");
}

export function exifOrientation(bytes: Uint8Array): number | null {
    const tiff = bytes.length >= 6 && ascii(bytes, 0, 6) === "Exif\u0000\u0000" ? bytes.subarray(6) : bytes;
    if (tiff.length < 8) {
        return null;
    }
    const endian = ascii(tiff, 0, 2);
    if (endian !== "II" && endian !== "MM") {
        return null;
    }
    const read16 = endian === "II" ? readU16LE : readU16BE;
    const read32 = endian === "II" ? readU32LE : readU32BE;
    try {
        if (read16(tiff, 2) !== 42) {
            return null;
        }
        const ifdOffset = read32(tiff, 4);
        const count = read16(tiff, ifdOffset);
        if (count > 512) {
            return null;
        }
        for (let index = 0; index < count; index++) {
            const entry = ifdOffset + 2 + index * 12;
            requireBytes(tiff, entry, 12);
            if (read16(tiff, entry) !== 0x0112 || read16(tiff, entry + 2) !== 3 || read32(tiff, entry + 4) !== 1) {
                continue;
            }
            const orientation = read16(tiff, entry + 8);
            return orientation >= 1 && orientation <= 8 ? orientation : null;
        }
    } catch {
        return null;
    }
    return null;
}
