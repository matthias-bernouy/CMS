export type BuiltIntegrationCandidate = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
    verificationDigest: string;
    candidateDigest: string;
    canonicalBytes: Uint8Array;
}>;

export type ManagementCandidateResult =
    | Readonly<{ outcome: "published"; candidateId: string }>
    | Readonly<{ outcome: "unchanged" }>
    | Readonly<{
          outcome: "failed";
          reason: "conflict" | "invalid-response" | "rejected" | "timeout" | "transport" | "upstream";
          status?: number;
          code?: string;
          retryAfterSeconds?: number;
      }>;

export type RepositoryManagementCandidateClientConfig = Readonly<{
    managementUrl: string;
    token: string;
    timeoutMs: number;
    pollIntervalMs?: number;
    fetch?: typeof fetch;
    now?: () => number;
    wait?: (milliseconds: number) => Promise<void>;
}>;

export type CandidateProjection = Readonly<{
    candidateId: string;
    status: string;
    kind: string;
    version: string;
    candidateDigest: string;
    packageDigest: string;
    verificationDigest: string;
    failureCode?: string;
}>;

export function parseCandidateProjection(
    body: Readonly<Record<string, unknown>>,
    expected: BuiltIntegrationCandidate,
): CandidateProjection | null {
    const value = record(body.candidate);
    const failure = record(value?.lastFailure);
    if (
        !value ||
        !identifier(value.candidateId) ||
        !identifier(value.status) ||
        value.kind !== expected.kind ||
        value.version !== expected.version ||
        value.candidateDigest !== expected.candidateDigest ||
        value.packageDigest !== expected.packageDigest ||
        value.verificationDigest !== expected.verificationDigest
    ) {
        return null;
    }
    return {
        candidateId: value.candidateId,
        status: value.status,
        kind: expected.kind,
        version: expected.version,
        candidateDigest: expected.candidateDigest,
        packageDigest: expected.packageDigest,
        verificationDigest: expected.verificationDigest,
        ...(safeCode(failure?.code) ? { failureCode: safeCode(failure?.code) } : {}),
    };
}

export function exactPublishedVersion(
    body: Readonly<Record<string, unknown>>,
    candidate: BuiltIntegrationCandidate,
): "absent" | "unchanged" | "conflict" | "invalid" {
    if (body.kind !== candidate.kind || !Array.isArray(body.versions)) {
        return "invalid";
    }
    const exact = body.versions.find((entry) => record(entry)?.version === candidate.version);
    if (!exact) {
        return "absent";
    }
    const version = record(exact)!;
    return version.digest === candidate.packageDigest ? "unchanged" : "conflict";
}

export function safeCode(value: unknown): string | undefined {
    return typeof value === "string" && /^[a-z0-9_]{1,80}$/u.test(value) ? value : undefined;
}

function identifier(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);
}

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
