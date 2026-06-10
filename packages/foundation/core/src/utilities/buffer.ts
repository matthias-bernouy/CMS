/**
 * The mongodb driver returns stored Buffers as BSON `Binary`, whose
 * `.buffer` field carries the raw bytes. Normalize at the read boundary
 * so downstream code (crypto, hashing, …) always sees a plain Buffer.
 */
export function asBuffer(v: Buffer | { buffer: Buffer }): Buffer {
    return Buffer.isBuffer(v) ? v : Buffer.from(v.buffer);
}
