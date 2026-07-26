import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type { ObservedSchemaContractIdentity, ObservedSchemaContractV1 } from "../../../../../interfaces/Integration";
import { parseObservedSchemaContractV1 } from "./parse";

export function canonicalObservedSchemaContractBytes(value: unknown): Uint8Array {
    return canonicalJsonBytes(parseObservedSchemaContractV1(value));
}

export async function identifyObservedSchemaContract(value: unknown): Promise<ObservedSchemaContractIdentity> {
    const canonicalBytes = canonicalObservedSchemaContractBytes(value);
    return { canonicalBytes, digest: await sha256Hex(canonicalBytes) };
}

export function sameObservedSchemaContract(left: ObservedSchemaContractV1, right: ObservedSchemaContractV1): boolean {
    const leftBytes = canonicalObservedSchemaContractBytes(left);
    const rightBytes = canonicalObservedSchemaContractBytes(right);
    return (
        leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index])
    );
}
