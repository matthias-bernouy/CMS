import type { Runner } from "@bernouy/http-runner";
import { readCanonicalCandidate, RepositoryCandidateRequestError } from "../body";
import {
    REPOSITORY_CANDIDATES_PATH,
    REPOSITORY_CANDIDATE_REPORT_PATH,
    REPOSITORY_CANDIDATE_STATUS_PATH,
    type RepositoryCandidateManagementRoutesConfig,
} from "../contracts";
import { candidateJsonResponse, candidateProtocolErrorResponse } from "../responses";
import { projectCandidateReport, projectManagementCandidateStatus } from "./projection";
import { candidateIdentifier, readCandidateId } from "./query";

export function mountRepositoryCandidateManagementRoutes(
    runner: Runner,
    config: RepositoryCandidateManagementRoutesConfig,
): void {
    assertConfig(config);
    runner.post(REPOSITORY_CANDIDATES_PATH, async (request) => {
        try {
            const submittedBy = readAuthenticatedCandidateActor(request);
            const candidate = await readCanonicalCandidate(request, config.maxBodyBytes);
            const createdAt = canonicalTimestamp(config.now());
            const candidateId = candidateIdentifier(config.createCandidateId());
            const expiresAt = addMilliseconds(createdAt, config.candidateTtlMs);
            const record = await config.admission.submit({
                candidateId,
                ...(submittedBy ? { submittedBy } : {}),
                candidate,
                createdAt,
                expiresAt,
            });
            return candidateJsonResponse(202, { candidate: projectManagementCandidateStatus(record) });
        } catch (error) {
            return candidateProtocolErrorResponse(error);
        }
    });
    runner.get(REPOSITORY_CANDIDATE_STATUS_PATH, async (request) => {
        try {
            const record = await config.store.get(readCandidateId(request));
            return record
                ? candidateJsonResponse(200, { candidate: projectManagementCandidateStatus(record) })
                : candidateNotFound();
        } catch (error) {
            return candidateProtocolErrorResponse(error);
        }
    });
    runner.get(REPOSITORY_CANDIDATE_REPORT_PATH, async (request) => {
        try {
            const candidateId = readCandidateId(request);
            const record = await config.store.get(candidateId);
            if (!record) {
                return candidateNotFound();
            }
            const report = await projectCandidateReport(record, await config.store.objects(candidateId));
            return candidateJsonResponse(200, { report });
        } catch (error) {
            return candidateProtocolErrorResponse(error);
        }
    });
}

function readAuthenticatedCandidateActor(request: Request): string | undefined {
    const encoded = request.headers.get("x-p9r-authenticated-actor");
    if (encoded === null) {
        return undefined;
    }
    if (!encoded || encoded.length > 4_608) {
        throw new RepositoryCandidateRequestError("Authenticated candidate actor is invalid");
    }
    let actor: string;
    try {
        actor = decodeURIComponent(encoded);
    } catch {
        throw new RepositoryCandidateRequestError("Authenticated candidate actor is invalid");
    }
    if (
        encodeURIComponent(actor) !== encoded ||
        !actor.trim() ||
        actor.length > 512 ||
        /[\u0000-\u001f\u007f]/u.test(actor)
    ) {
        throw new RepositoryCandidateRequestError("Authenticated candidate actor is invalid");
    }
    return actor;
}

function candidateNotFound(): Response {
    return candidateJsonResponse(404, { code: "candidate_not_found", error: "Candidate was not found" });
}

function assertConfig(config: RepositoryCandidateManagementRoutesConfig): void {
    positiveInteger(config.maxBodyBytes, "Candidate body limit");
    positiveInteger(config.candidateTtlMs, "Candidate TTL");
    if (!config.store || typeof config.store.get !== "function" || typeof config.store.objects !== "function") {
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

function positiveInteger(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError(`${label} must be a positive safe integer`);
    }
}
