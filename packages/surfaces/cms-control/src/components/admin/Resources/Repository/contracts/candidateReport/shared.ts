import {
    optionalProperty,
    readArray,
    readBoolean,
    readCount,
    readOptionalText,
    readRecord,
    readText,
} from "../parsing";
import type { RepositoryCandidateObservationView, RepositoryCandidateVersionReferenceView } from "./types";

export function parseVersionReference(value: unknown): RepositoryCandidateVersionReferenceView {
    const source = readRecord(value);
    return {
        kind: readText(source.kind),
        version: readText(source.version),
        packageDigest: readText(source.packageDigest),
    };
}

export function parseObservation(value: unknown): RepositoryCandidateObservationView {
    const source = readRecord(value);
    return {
        status: readText(source.status),
        evidenceDigests: readArray(source.evidenceDigests).map(readText),
        diagnosticCodes: readArray(source.diagnosticCodes).map(readText),
    };
}

export function optionalBoolean(value: unknown): boolean | undefined {
    return value === undefined ? undefined : readBoolean(value);
}

export function optionalCount(value: unknown): number | undefined {
    return value === undefined ? undefined : readCount(value);
}

export function optionalText<Key extends string>(key: Key, value: unknown): Partial<Record<Key, string>> {
    return optionalProperty(key, readOptionalText(value));
}
