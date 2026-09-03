import { parseCandidateProjection, safeCode, type PublicationResult } from "./contracts";
import { retryAfter } from "./http";

export function terminalResult(
    projection: NonNullable<ReturnType<typeof parseCandidateProjection>>,
): PublicationResult | null {
    if (projection.status === "published") {
        return { outcome: "published", candidateId: projection.candidateId };
    }
    if (projection.status === "rejected" || projection.status === "expired") {
        return {
            outcome: "failed",
            reason: "rejected",
            status: 422,
            code:
                projection.failureCode ??
                (projection.status === "expired" ? "candidate_expired" : "candidate_rejected"),
        };
    }
    return null;
}

export function responseFailure(
    response: Response,
    body: Readonly<Record<string, unknown>>,
): Extract<PublicationResult, { outcome: "failed" }> {
    return {
        outcome: "failed",
        reason: response.status === 409 ? "conflict" : response.status === 422 ? "rejected" : "upstream",
        status: response.status,
        ...(safeCode(body.code) ? { code: safeCode(body.code) } : {}),
        ...retryAfter(response.headers.get("retry-after")),
    };
}

export function authorization(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
}

export function remaining(deadline: number, now: () => number): number {
    return Math.max(0, deadline - now());
}
