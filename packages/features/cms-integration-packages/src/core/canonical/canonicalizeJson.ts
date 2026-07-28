import canonicalize from "canonicalize";
import { assertIJsonValue, InvalidIJsonValueError } from "./assertIJson";

const utf8 = new TextEncoder();

export function canonicalizeJson(value: unknown): string {
    assertIJsonValue(value);
    const result = canonicalize(value);
    if (result === undefined) {
        throw new InvalidIJsonValueError("the root value cannot be serialized");
    }
    return result;
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
    return utf8.encode(canonicalizeJson(value));
}
