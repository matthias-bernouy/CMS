import {
    exactPublishedVersion,
    parseCandidateProjection,
    safeCode,
    type BuiltIntegrationCandidate,
    type ManagementCandidateResult,
    type RepositoryManagementCandidateClientConfig,
} from "./contracts";
import { candidateHttpRequest, retryAfter, retryRateLimitedCandidateRequest } from "./http";

const CANDIDATE_PATH = "/api/integrations/candidates";
const CANDIDATE_STATUS_PATH = "/api/integrations/candidates/status";
const VERSIONS_PATH = "/api/integrations/versions";

export async function publishIntegrationCandidate(
    config: RepositoryManagementCandidateClientConfig,
    candidate: BuiltIntegrationCandidate,
): Promise<ManagementCandidateResult> {
    const now = config.now ?? Date.now;
    const deadline = now() + config.timeoutMs;
    const existing = await inspectExisting(config, candidate, deadline, now);
    if (existing !== "absent") {
        return existing;
    }
    const submitted = await submit(config, candidate, deadline, now);
    if (submitted.outcome !== "submitted") {
        return await reconcileConcurrentPublication(config, candidate, submitted, deadline, now);
    }
    const result = await poll(config, candidate, submitted.candidateId, deadline, now);
    return await reconcileConcurrentPublication(config, candidate, result, deadline, now);
}

async function reconcileConcurrentPublication(
    config: RepositoryManagementCandidateClientConfig,
    candidate: BuiltIntegrationCandidate,
    result: ManagementCandidateResult,
    deadline: number,
    now: () => number,
): Promise<ManagementCandidateResult> {
    if (
        result.outcome !== "failed" ||
        !["admission_inputs_stale", "admission_stale", "integration_version_exists"].includes(result.code ?? "")
    ) {
        return result;
    }
    const current = await inspectExisting(config, candidate, deadline, now);
    return current !== "absent" && current.outcome === "unchanged" ? current : result;
}

async function inspectExisting(
    config: RepositoryManagementCandidateClientConfig,
    candidate: BuiltIntegrationCandidate,
    deadline: number,
    now: () => number,
): Promise<ManagementCandidateResult | "absent"> {
    const request = await retryRateLimitedCandidateRequest(config, deadline, now, (timeoutMs) =>
        candidateHttpRequest(
            config,
            `${config.managementUrl}${VERSIONS_PATH}?kind=${encodeURIComponent(candidate.kind)}`,
            { headers: authorization(config.token) },
            timeoutMs,
        ),
    );
    if ("outcome" in request) {
        return request;
    }
    if (request.response.status === 404) {
        return "absent";
    }
    if (request.response.status !== 200) {
        return failure(request.response, request.body);
    }
    switch (exactPublishedVersion(request.body, candidate)) {
        case "absent":
            return "absent";
        case "unchanged":
            return { outcome: "unchanged" };
        case "conflict":
            return { outcome: "failed", reason: "conflict", status: 409, code: "integration_version_exists" };
        default:
            return { outcome: "failed", reason: "invalid-response", status: 200 };
    }
}

async function submit(
    config: RepositoryManagementCandidateClientConfig,
    candidate: BuiltIntegrationCandidate,
    deadline: number,
    now: () => number,
): Promise<ManagementCandidateResult | Readonly<{ outcome: "submitted"; candidateId: string }>> {
    const request = await retryRateLimitedCandidateRequest(config, deadline, now, (timeoutMs) => {
        const body = new Uint8Array(candidate.canonicalBytes);
        return candidateHttpRequest(
            config,
            `${config.managementUrl}${CANDIDATE_PATH}`,
            {
                method: "POST",
                headers: {
                    ...authorization(config.token),
                    "content-length": String(body.byteLength),
                    "content-type": "application/json",
                },
                body: body.buffer,
            },
            timeoutMs,
        );
    });
    if ("outcome" in request) {
        return request;
    }
    if (request.response.status !== 202) {
        return failure(request.response, request.body);
    }
    const projection = parseCandidateProjection(request.body, candidate);
    if (!projection) {
        return { outcome: "failed", reason: "invalid-response", status: 202 };
    }
    const terminal = terminalResult(projection);
    return terminal ?? { outcome: "submitted", candidateId: projection.candidateId };
}

async function poll(
    config: RepositoryManagementCandidateClientConfig,
    candidate: BuiltIntegrationCandidate,
    candidateId: string,
    deadline: number,
    now: () => number,
): Promise<ManagementCandidateResult> {
    const wait = config.wait ?? ((milliseconds: number) => Bun.sleep(milliseconds));
    const interval = config.pollIntervalMs ?? 2_000;
    while (remaining(deadline, now) > 0) {
        await wait(Math.min(interval, remaining(deadline, now)));
        if (remaining(deadline, now) <= 0) {
            break;
        }
        const request = await retryRateLimitedCandidateRequest(config, deadline, now, (timeoutMs) =>
            candidateHttpRequest(
                config,
                `${config.managementUrl}${CANDIDATE_STATUS_PATH}?candidateId=${encodeURIComponent(candidateId)}`,
                { headers: authorization(config.token) },
                timeoutMs,
            ),
        );
        if ("outcome" in request) {
            return request;
        }
        if (request.response.status !== 200) {
            return failure(request.response, request.body);
        }
        const projection = parseCandidateProjection(request.body, candidate);
        if (!projection || projection.candidateId !== candidateId) {
            return { outcome: "failed", reason: "invalid-response", status: 200 };
        }
        const terminal = terminalResult(projection);
        if (terminal) {
            return terminal;
        }
    }
    return { outcome: "failed", reason: "timeout" };
}

function terminalResult(
    projection: NonNullable<ReturnType<typeof parseCandidateProjection>>,
): ManagementCandidateResult | null {
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

function failure(response: Response, body: Readonly<Record<string, unknown>>): ManagementCandidateResult {
    return {
        outcome: "failed",
        reason: response.status === 409 ? "conflict" : response.status === 422 ? "rejected" : "upstream",
        status: response.status,
        ...(safeCode(body.code) ? { code: safeCode(body.code) } : {}),
        ...retryAfter(response.headers.get("retry-after")),
    };
}

function authorization(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
}

function remaining(deadline: number, now: () => number): number {
    return Math.max(0, deadline - now());
}
