export type RepositoryCompatibilityQuery = Readonly<{
    kind: string;
    version: string;
    after?: string;
    limit?: number;
}>;

export type RepositoryReevaluationInput = Readonly<{
    kind: string;
    version: string;
    currentReportRevisionId: string;
    currentDecision: Readonly<{ revisionId: string; digest: string }>;
    reason: string;
    evidenceIds?: readonly string[];
}>;

export type RepositoryStablePromotionInput = Readonly<{
    kind: string;
    version: string;
    currentReportRevisionId: string;
    confirmation: Readonly<{
        version: string;
        reportRevisionId: string;
    }>;
    reason?: string;
}>;

export type RepositoryVersionBlockInput = Readonly<{
    kind: string;
    version: string;
    currentDecision: Readonly<{ revisionId: string; digest: string }>;
    reason: string;
    confirmation: Readonly<{
        action: "block";
        kind: string;
        version: string;
        decisionRevisionId: string;
        decisionDigest: string;
    }>;
}>;

/**
 * Server-side repository capability. Implementations own the internal token,
 * inject the configured administrator actor, validate upstream DTOs, and
 * return sanitized responses. Browser code only reaches the allowlisted
 * Control routes backed by these methods.
 */
export interface RepositoryManagementGateway {
    status(): Promise<Response>;
    diagnostics(): Promise<Response>;
    versions(kind: string): Promise<Response>;
    release(kind: string, version: string): Promise<Response>;
    compatibility(query: RepositoryCompatibilityQuery): Promise<Response>;
    publish(packageDocument: Uint8Array): Promise<Response>;
    submitCandidate(candidateDocument: Uint8Array): Promise<Response>;
    candidateStatus(candidateId: string): Promise<Response>;
    reevaluate(input: RepositoryReevaluationInput): Promise<Response>;
    promoteStable(input: RepositoryStablePromotionInput): Promise<Response>;
    blockVersion(input: RepositoryVersionBlockInput): Promise<Response>;
}
