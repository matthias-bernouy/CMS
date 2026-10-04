export type BinaryInput = Blob | Uint8Array;

const blobSize = Object.getOwnPropertyDescriptor(Blob.prototype, "size")!.get!;
const typedArraySize = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), "byteLength")!.get!;

export function binaryByteLength(value: BinaryInput): number {
    if (!(value instanceof Blob || value instanceof Uint8Array)) {
        throw new TypeError("binary input must be a Blob or Uint8Array");
    }
    return (value instanceof Blob ? blobSize : typedArraySize).call(value) as number;
}

/** Own the bytes before any asynchronous verification can observe caller mutation. */
export function snapshotBinary(value: BinaryInput): Blob {
    binaryByteLength(value);
    return new Blob([value instanceof Blob ? value : new Uint8Array(value)]);
}

export async function readBinaryBytes(value: BinaryInput): Promise<Uint8Array> {
    const snapshot = snapshotBinary(value);
    return new Uint8Array(await snapshot.arrayBuffer());
}
