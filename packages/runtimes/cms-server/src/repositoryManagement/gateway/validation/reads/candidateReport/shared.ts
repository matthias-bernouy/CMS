import {
    array,
    canonicalText,
    digest,
    enumValue,
    exactObject,
    packageKind,
    packageVersion,
    type JsonObject,
} from "../../helpers";

export const OBSERVATION_STATUSES = [
    "passed",
    "failed",
    "not-supported",
    "not-applicable",
    "infrastructure-failure",
] as const;

export type CandidateReportIdentity = Readonly<{
    candidateId: string;
    candidateDigest: string;
    packageDigest: string;
    verificationDigest: string;
    kind: string;
    version: string;
}>;

export function candidateReportIdentity(candidate: JsonObject): CandidateReportIdentity {
    return {
        candidateId: identifier(candidate.candidateId),
        candidateDigest: digest(candidate.candidateDigest),
        packageDigest: digest(candidate.packageDigest),
        verificationDigest: digest(candidate.verificationDigest),
        kind: packageKind(candidate.kind),
        version: packageVersion(candidate.version),
    };
}

export function versionReference(value: unknown): JsonObject {
    const reference = exactObject(value, ["kind", "version", "packageDigest"]);
    packageKind(reference.kind);
    packageVersion(reference.version);
    digest(reference.packageDigest);
    return reference;
}

export function baseObservation(value: unknown, optional: readonly string[] = []): JsonObject {
    const observation = exactObject(value, ["status", "evidenceDigests", "diagnosticCodes"], optional);
    enumValue(observation.status, OBSERVATION_STATUSES);
    uniqueDigests(observation.evidenceDigests, 64);
    uniqueIdentifiers(observation.diagnosticCodes, 64);
    return observation;
}

export function uniqueDigests(value: unknown, maximum = 4_096): readonly string[] {
    return unique(array(value, maximum).map(digest));
}

export function uniqueIdentifiers(value: unknown, maximum = 4_096): readonly string[] {
    return unique(array(value, maximum).map(identifier));
}

export function identifier(value: unknown): string {
    const identifier = canonicalText(value, 512);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u.test(identifier)) {
        throw new TypeError("Repository candidate report identifier is invalid");
    }
    return identifier;
}

export function prefixedDigest(value: unknown): string {
    const result = canonicalText(value, 71);
    if (!/^sha256:[a-f0-9]{64}$/u.test(result)) {
        throw new TypeError("Repository candidate report prefixed digest is invalid");
    }
    return result;
}

function unique<T>(values: readonly T[]): readonly T[] {
    if (new Set(values).size !== values.length) {
        throw new TypeError("Repository candidate report array contains duplicates");
    }
    return values;
}
