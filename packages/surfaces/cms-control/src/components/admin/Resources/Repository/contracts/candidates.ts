import { readCount, readOptionalText, readRecord, readText } from "./parsing";

export type RepositoryCandidateView = Readonly<{
    candidateId: string;
    revision: number;
    status: string;
    kind: string;
    version: string;
    candidateDigest: string;
    packageDigest: string;
    verificationDigest: string;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
    attemptCount: number;
    failureCode?: string;
}>;

export function parseRepositoryCandidateResponse(value: unknown): RepositoryCandidateView {
    const source = readRecord(readRecord(value).candidate);
    const failure = source.lastFailure === undefined ? undefined : readRecord(source.lastFailure);
    return {
        candidateId: readText(source.candidateId),
        revision: readCount(source.revision),
        status: readText(source.status),
        kind: readText(source.kind),
        version: readText(source.version),
        candidateDigest: readText(source.candidateDigest),
        packageDigest: readText(source.packageDigest),
        verificationDigest: readText(source.verificationDigest),
        createdAt: readText(source.createdAt),
        updatedAt: readText(source.updatedAt),
        expiresAt: readText(source.expiresAt),
        attemptCount: readCount(source.attemptCount),
        ...(readOptionalText(failure?.code) ? { failureCode: readText(failure?.code) } : {}),
    };
}
