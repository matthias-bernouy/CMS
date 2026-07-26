import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import { parseRepositoryDiagnostics, parseRepositoryStatus, parseRepositoryVersions } from "./contracts/read";
import { parseRepositoryCandidateResponse, type RepositoryCandidateView } from "./contracts/candidates";
import { parseRepositoryRelease } from "./contracts/release/parsing";
import type { RepositoryReleaseView } from "./contracts/release/types";
import { readOptionalText, readRecord } from "./contracts/parsing";
import {
    parseRepositoryActionErrorDetails,
    parseRepositoryCompatibilityPage,
    parseRepositoryPromotionResult,
    parseRepositoryPublicationResult,
    parseRepositoryReevaluationResult,
    parseRepositoryVersionBlockResult,
} from "./contracts/reports";
import type {
    RepositoryActionErrorDetails,
    RepositoryCompatibilityPageView,
    RepositoryDiagnosticsView,
    RepositoryPromotionResultView,
    RepositoryPublicationResultView,
    RepositoryReevaluationResultView,
    RepositoryStatusView,
    RepositoryVersionsView,
    RepositoryVersionBlockResultView,
} from "./contracts/types";

export class RepositoryApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string | undefined,
        readonly retryAfter: string | undefined,
        readonly details: RepositoryActionErrorDetails,
    ) {
        super(`Repository request failed with status ${status}`);
        this.name = "RepositoryApiError";
    }
}

export function fetchRepositoryStatus(signal?: AbortSignal): Promise<RepositoryStatusView> {
    return get("/status", parseRepositoryStatus, undefined, signal);
}

export function fetchRepositoryDiagnostics(signal?: AbortSignal): Promise<RepositoryDiagnosticsView> {
    return get("/diagnostics", parseRepositoryDiagnostics, undefined, signal);
}

export function fetchRepositoryVersions(kind: string, signal?: AbortSignal): Promise<RepositoryVersionsView> {
    return get("/versions", parseRepositoryVersions, { kind }, signal);
}

export function fetchRepositoryRelease(
    kind: string,
    version: string,
    signal?: AbortSignal,
): Promise<RepositoryReleaseView> {
    return get("/release", parseRepositoryRelease, { kind, version }, signal);
}

export function fetchRepositoryCompatibility(
    kind: string,
    version: string,
    after?: string,
    signal?: AbortSignal,
): Promise<RepositoryCompatibilityPageView> {
    return get(
        "/compatibility",
        parseRepositoryCompatibilityPage,
        { kind, version, limit: "100", ...(after ? { after } : {}) },
        signal,
    );
}

export function publishRepositoryPackage(file: Blob, signal?: AbortSignal): Promise<RepositoryPublicationResultView> {
    return request("/publications", parseRepositoryPublicationResult, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: file,
        signal,
    });
}

export function submitRepositoryCandidate(file: Blob, signal?: AbortSignal): Promise<RepositoryCandidateView> {
    return request("/candidates", parseRepositoryCandidateResponse, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: file,
        signal,
    });
}

export function fetchRepositoryCandidateStatus(
    candidateId: string,
    signal?: AbortSignal,
): Promise<RepositoryCandidateView> {
    return get("/candidates/status", parseRepositoryCandidateResponse, { candidateId }, signal);
}

export function requestRepositoryReevaluation(
    input: Readonly<{
        kind: string;
        version: string;
        currentReportRevisionId: string;
        reason: string;
        evidenceIds?: readonly string[];
    }>,
    signal?: AbortSignal,
): Promise<RepositoryReevaluationResultView> {
    return postJson("/reevaluations", input, parseRepositoryReevaluationResult, signal);
}

export function requestRepositoryStablePromotion(
    input: Readonly<{
        kind: string;
        version: string;
        currentReportRevisionId: string;
        confirmation: Readonly<{ version: string; reportRevisionId: string }>;
        reason?: string;
    }>,
    signal?: AbortSignal,
): Promise<RepositoryPromotionResultView> {
    return postJson("/stable-promotions", input, parseRepositoryPromotionResult, signal);
}

export function requestRepositoryVersionBlock(
    input: Readonly<{
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
    }>,
    signal?: AbortSignal,
): Promise<RepositoryVersionBlockResultView> {
    return postJson("/version-blocks", input, parseRepositoryVersionBlockResult, signal);
}

function get<T>(
    path: string,
    parse: (value: unknown) => T,
    query?: Readonly<Record<string, string>>,
    signal?: AbortSignal,
): Promise<T> {
    const search = new URLSearchParams(query).toString();
    return request(`${path}${search ? `?${search}` : ""}`, parse, {
        headers: { Accept: "application/json" },
        signal,
    });
}

function postJson<T>(path: string, body: unknown, parse: (value: unknown) => T, signal?: AbortSignal): Promise<T> {
    return request(path, parse, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
    });
}

async function request<T>(path: string, parse: (value: unknown) => T, init: RequestInit): Promise<T> {
    const response = await fetch(`${getMetaBasePath()}/api/repository${path}`, init);
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
        throw repositoryApiError(response, body);
    }
    return parse(body);
}

function repositoryApiError(response: Response, body: unknown): RepositoryApiError {
    let code: string | undefined;
    let details: RepositoryActionErrorDetails = {};
    try {
        const object = readRecord(body);
        code = readOptionalText(object.code);
        details = parseRepositoryActionErrorDetails(object);
    } catch {
        // The gateway status is sufficient; malformed details are never rendered.
    }
    const retryAfter = response.status === 429 ? normalizedRetryAfter(response.headers.get("retry-after")) : undefined;
    return new RepositoryApiError(response.status, code, retryAfter, details);
}

function normalizedRetryAfter(value: string | null): string | undefined {
    return value && /^[1-9][0-9]*$/u.test(value) ? value : undefined;
}
