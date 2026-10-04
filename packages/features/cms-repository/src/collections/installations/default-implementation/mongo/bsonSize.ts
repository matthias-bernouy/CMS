import { BSON } from "mongodb";

export const MAX_MONGO_BSON_DOCUMENT_BYTES = 16 * 1024 * 1024;

/** Fail before issuing a Mongo write that the server must reject for BSON size. */
export function assertMongoBsonDocumentSize(document: Record<string, unknown>, label: string): void {
    let byteLength: number;
    try {
        byteLength = BSON.calculateObjectSize(document, { ignoreUndefined: false });
    } catch (error) {
        throw new TypeError(`${label} cannot be encoded as BSON`, { cause: error });
    }
    if (byteLength > MAX_MONGO_BSON_DOCUMENT_BYTES) {
        throw new TypeError(`${label} exceeds MongoDB's 16 MiB BSON document limit`);
    }
}
