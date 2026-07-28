import type { BuiltOfficialIntegrationCandidate } from "@bernouy/cms-official-integrations/publication";
import {
    exactPublishedVersion,
    parseCandidateProjection,
    safeCode,
    type ManagementCandidateResult,
    type RepositoryManagementCandidateClientConfig,
} from "./contracts";
import { candidateHttpRequest, retryAfter } from "./http";

const CANDIDATE_PATH = "/api/integrations/candidates";
const CANDIDATE_STATUS_PATH = "/api/integrations/candidates/status";
const VERSIONS_PATH = "/api/integrations/versions";

export async function publishOfficialIntegrationCandidate(
    config: RepositoryManagementCandidateClientConfig,
    candidate: BuiltOfficialIntegrationCandidate,
): Promise<ManagementCandidateResult> {
    const now = config.now ?? Date.now;
    const deadline = now() + config.timeoutMs;
    const existing = await inspectExisting(config, candidate, remaining(deadline, now));
    if (existing !== "absent") {
        return existing;
    }
    const submitted = await submit(config, candidate, remaining(deadline, now));
    if (submitted.outcome !== "submitted") {
        return submitted;
    }
    return await poll(config, candidate, submitted.candidateId, deadline, now);
}

async function inspectExisting(
    config: RepositoryManagementCandidateClientConfig,
    candidate: BuiltOfficialIntegrationCandidate,
    timeoutMs: number,
): Promise<ManagementCandidateResult | "absent"> {
    const request = await candidateHttpRequest(
        config,
        `${config.managementUrl}${VERSIONS_PATH}?kind=${encodeURIComponent(candidate.kind)}`,
        { headers: authorization(config.token) },
        timeoutMs,
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
        case "admissible":
            return { outcome: "unchanged" };
        case "conflict":
            return { outcome: "failed", reason: "conflict", status: 409, code: "integration_version_exists" };
        case "inadmissible":
            return { outcome: "failed", reason: "rejected", status: 422, code: "release_not_admissible" };
        default:
            return { outcome: "failed", reason: "invalid-response", status: 200 };
    }
}

async function submit(
    config: RepositoryManagementCandidateClientConfig,
    candidate: BuiltOfficialIntegrationCandidate,
    timeoutMs: number,
): Promise<ManagementCandidateResult | Readonly<{ outcome: "submitted"; candidateId: string }>> {
    const body = new Uint8Array(candidate.canonicalBytes);
    const request = await candidateHttpRequest(
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
    candidate: BuiltOfficialIntegrationCandidate,
    candidateId: string,
    deadline: number,
    now: () => number,
): Promise<ManagementCandidateResult> {
    const wait = config.wait ?? ((milliseconds: number) => Bun.sleep(milliseconds));
    const interval = config.pollIntervalMs ?? 2_000;
    while (remaining(deadline, now) > 0) {
        await wait(Math.min(interval, remaining(deadline, now)));
        const request = await candidateHttpRequest(
            config,
            `${config.managementUrl}${CANDIDATE_STATUS_PATH}?candidateId=${encodeURIComponent(candidateId)}`,
            { headers: authorization(config.token) },
            remaining(deadline, now),
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
