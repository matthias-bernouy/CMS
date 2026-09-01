import { HttpError } from "../../../http.ts";

export function ascii(bytes: Uint8Array, offset: number, length: number): string {
    requireBytes(bytes, offset, length);
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

export function requireBytes(bytes: Uint8Array, offset: number, length: number): void {
    if (offset < 0 || length < 0 || offset + length > bytes.length) {
        malformed();
    }
}

export function malformed(): never {
    throw new HttpError(400, "file is not a valid supported image");
}
