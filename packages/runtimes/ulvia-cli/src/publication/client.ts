import {
    exactPublishedVersion,
    parseCandidateProjection,
    type BuiltLocalCandidate,
    type PublicationClientConfig,
    type PublicationResult,
} from "./contracts";
import { publicationHttpRequest, retryRateLimitedRequest } from "./http";
import { authorization, remaining, responseFailure, terminalResult } from "./responses";

const CANDIDATE_PATH = "/api/integrations/candidates";
const CANDIDATE_STATUS_PATH = "/api/integrations/candidates/status";
const VERSIONS_PATH = "/api/integrations/versions";

export async function publishLocalCandidate(
    config: PublicationClientConfig,
    candidate: BuiltLocalCandidate,
): Promise<PublicationResult> {
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
    config: PublicationClientConfig,
    candidate: BuiltLocalCandidate,
    result: PublicationResult,
    deadline: number,
    now: () => number,
): Promise<PublicationResult> {
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
    config: PublicationClientConfig,
    candidate: BuiltLocalCandidate,
    deadline: number,
    now: () => number,
): Promise<PublicationResult | "absent"> {
    const request = await retryRateLimitedRequest(config, deadline, now, (timeoutMs) =>
        publicationHttpRequest(
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
        return responseFailure(request.response, request.body);
    }
    const state = exactPublishedVersion(request.body, candidate);
    if (state === "absent") {
        return state;
    }
    if (state === "unchanged") {
        return { outcome: "unchanged" };
    }
    return state === "conflict"
        ? { outcome: "failed", reason: "conflict", status: 409, code: "integration_version_exists" }
        : { outcome: "failed", reason: "invalid-response", status: 200 };
}

async function submit(
    config: PublicationClientConfig,
    candidate: BuiltLocalCandidate,
    deadline: number,
    now: () => number,
): Promise<PublicationResult | Readonly<{ outcome: "submitted"; candidateId: string }>> {
    const request = await retryRateLimitedRequest(config, deadline, now, (timeoutMs) => {
        const body = new Uint8Array(candidate.canonicalBytes);
        return publicationHttpRequest(
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
        return responseFailure(request.response, request.body);
    }
    const projection = parseCandidateProjection(request.body, candidate);
    if (!projection) {
        return { outcome: "failed", reason: "invalid-response", status: 202 };
    }
    return terminalResult(projection) ?? { outcome: "submitted", candidateId: projection.candidateId };
}

async function poll(
    config: PublicationClientConfig,
    candidate: BuiltLocalCandidate,
    candidateId: string,
    deadline: number,
    now: () => number,
): Promise<PublicationResult> {
    const wait = config.wait ?? ((milliseconds: number) => Bun.sleep(milliseconds));
    const interval = config.pollIntervalMs ?? 2_000;
    while (remaining(deadline, now) > 0) {
        await wait(Math.min(interval, remaining(deadline, now)));
        if (remaining(deadline, now) <= 0) {
            break;
        }
        const request = await retryRateLimitedRequest(config, deadline, now, (timeoutMs) =>
            publicationHttpRequest(
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
            return responseFailure(request.response, request.body);
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
