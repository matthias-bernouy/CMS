import type { Runner } from "@bernouy/http-runner";
import { readCanonicalCandidate, RepositoryCandidateRequestError } from "./body";
import {
    projectCandidateStatus,
    REPOSITORY_CANDIDATES_PATH,
    REPOSITORY_CANDIDATE_STATUS_PATH,
    type RepositoryCandidateManagementRoutesConfig,
} from "./contracts";
import { candidateJsonResponse, candidateProtocolErrorResponse } from "./responses";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export function mountRepositoryCandidateManagementRoutes(
    runner: Runner,
    config: RepositoryCandidateManagementRoutesConfig,
): void {
    assertConfig(config);
    runner.post(REPOSITORY_CANDIDATES_PATH, async (request) => {
        try {
            const candidate = await readCanonicalCandidate(request, config.maxBodyBytes);
            const createdAt = canonicalTimestamp(config.now());
            const candidateId = identifier(config.createCandidateId());
            const expiresAt = addMilliseconds(createdAt, config.candidateTtlMs);
            const record = await config.admission.submit({ candidateId, candidate, createdAt, expiresAt });
            return candidateJsonResponse(202, { candidate: projectCandidateStatus(record) });
        } catch (error) {
            return candidateProtocolErrorResponse(error);
        }
    });
    runner.get(REPOSITORY_CANDIDATE_STATUS_PATH, async (request) => {
        try {
            const candidateId = readCandidateId(request);
            const record = await config.store.get(candidateId);
            if (!record) {
                return candidateJsonResponse(404, {
                    code: "candidate_not_found",
                    error: "Candidate was not found",
                });
            }
            return candidateJsonResponse(200, { candidate: projectCandidateStatus(record) });
        } catch (error) {
            return candidateProtocolErrorResponse(error);
        }
    });
}

function readCandidateId(request: Request): string {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => key !== "candidateId") || params.getAll("candidateId").length !== 1) {
        throw new RepositoryCandidateRequestError("Invalid candidate status query");
    }
    return identifier(params.get("candidateId"));
}

function assertConfig(config: RepositoryCandidateManagementRoutesConfig): void {
    positiveInteger(config.maxBodyBytes, "Candidate body limit");
    positiveInteger(config.candidateTtlMs, "Candidate TTL");
    if (!config.store || typeof config.store.get !== "function") {
        throw new TypeError("Candidate store is required");
    }
    if (!config.admission || typeof config.admission.submit !== "function") {
        throw new TypeError("Candidate admission coordinator is required");
    }
    if (typeof config.now !== "function" || typeof config.createCandidateId !== "function") {
        throw new TypeError("Candidate management identity providers are required");
    }
}

function addMilliseconds(timestamp: string, duration: number): string {
    const result = Date.parse(timestamp) + duration;
    if (!Number.isSafeInteger(result)) {
        throw new TypeError("Candidate expiry is outside the supported timestamp range");
    }
    return new Date(result).toISOString();
}

function canonicalTimestamp(value: string): string {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
        throw new TypeError("Candidate clock must return a canonical timestamp");
    }
    return value;
}

function identifier(value: unknown): string {
    if (typeof value !== "string" || !IDENTIFIER.test(value)) {
        throw new TypeError("Candidate identifier is invalid");
    }
    return value;
}

function positiveInteger(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError(`${label} must be a positive safe integer`);
    }
}
