import type {
    RepositoryCompatibilityQuery,
    RepositoryManagementGateway,
    RepositoryReevaluationInput,
    RepositoryStablePromotionInput,
    RepositoryVersionBlockInput,
} from "@bernouy/cms-control";
import {
    normalizeCompatibilityQuery,
    normalizeManagementBaseUrl,
    normalizeManagementTimeout,
    normalizeManagementToken,
    preparePromotion,
    preparePublication,
    prepareReevaluation,
} from "./inputs";
import { prepareRepositoryCandidate, repositoryCandidateId } from "./requests/candidate";
import { prepareRepositoryVersionBlock } from "./requests/eligibility";
import {
    repositoryManagementJsonResponse,
    repositoryManagementUnavailableResponse,
    repositoryManagementUploadTooLargeResponse,
} from "./responses";
import {
    repositoryManagementRequest,
    REPOSITORY_MANAGEMENT_UPLOAD_LIMIT_BYTES,
    type RepositoryManagementTransportResponse,
} from "./transport";
import type { SanitizedRepositoryManagementResult } from "./validation/errors";
import { canonicalText, packageKind, packageVersion } from "./validation/helpers";
import { validateVersionBlockResponse } from "./validation/mutations/eligibility";
import { validatePromotionResponse } from "./validation/mutations/promotion";
import {
    validateCandidateStatusResponse,
    validateCandidateSubmissionResponse,
} from "./validation/mutations/candidates";
import { validatePublicationResponse } from "./validation/mutations/publication";
import { validateReevaluationResponse } from "./validation/mutations/reevaluation";
import {
    validateCompatibilityResponse,
    validateCandidateReportResponse,
    validateDiagnosticsResponse,
    validateReleaseResponse,
    validateStatusResponse,
    validateVersionsResponse,
} from "./validation/reads";

const PATHS = {
    status: "/api/status",
    diagnostics: "/api/diagnostics",
    versions: "/api/integrations/versions",
    compatibility: "/api/integrations/compatibility",
    publications: "/api/integrations/publications",
    candidates: "/api/integrations/candidates",
    candidateReport: "/api/integrations/candidates/report",
    candidateStatus: "/api/integrations/candidates/status",
    release: "/api/integrations/release",
    reevaluations: "/api/integrations/compatibility/reevaluations",
    stablePromotions: "/api/integrations/stable-promotions",
    versionBlocks: "/api/integrations/version-blocks",
} as const;

export type HttpRepositoryManagementGatewayConfig = Readonly<{
    baseUrl: string;
    token: string;
    administratorSubjectIdentifier: string;
    timeoutMs: number;
    fetch?: typeof fetch;
}>;

export class HttpRepositoryManagementGateway implements RepositoryManagementGateway {
    private readonly baseUrl: string;
    private readonly token: string;
    private readonly actor: string;
    private readonly timeoutMs: number;
    private readonly fetchImpl: typeof fetch;

    constructor(config: HttpRepositoryManagementGatewayConfig) {
        this.baseUrl = normalizeManagementBaseUrl(config.baseUrl);
        this.token = normalizeManagementToken(config.token);
        this.actor = canonicalText(config.administratorSubjectIdentifier, 512);
        this.timeoutMs = normalizeManagementTimeout(config.timeoutMs);
        if (config.fetch !== undefined && typeof config.fetch !== "function") {
            throw new TypeError("Repository management fetch implementation is invalid");
        }
        this.fetchImpl = config.fetch ?? fetch;
    }

    async status(): Promise<Response> {
        return await this.execute(PATHS.status, "GET", undefined, validateStatusResponse);
    }

    async diagnostics(): Promise<Response> {
        return await this.execute(PATHS.diagnostics, "GET", undefined, validateDiagnosticsResponse);
    }

    async versions(kind: string): Promise<Response> {
        try {
            const expectedKind = packageKind(kind);
            const url = this.endpoint(PATHS.versions);
            url.searchParams.set("kind", expectedKind);
            return this.sanitized(validateVersionsResponse(await this.request(url, "GET"), expectedKind));
        } catch {
            return repositoryManagementUnavailableResponse();
        }
    }

    async release(kind: string, version: string): Promise<Response> {
        try {
            const expected = { kind: packageKind(kind), version: packageVersion(version) };
            const url = this.endpoint(PATHS.release);
            url.searchParams.set("kind", expected.kind);
            url.searchParams.set("version", expected.version);
            return this.sanitized(validateReleaseResponse(await this.request(url, "GET"), expected));
        } catch {
            return repositoryManagementUnavailableResponse();
        }
    }

    async compatibility(query: RepositoryCompatibilityQuery): Promise<Response> {
        try {
            const normalized = normalizeCompatibilityQuery(query);
            const url = this.endpoint(PATHS.compatibility);
            url.searchParams.set("kind", normalized.kind);
            url.searchParams.set("version", normalized.version);
            if (normalized.after) {
                url.searchParams.set("after", normalized.after);
            }
            if (normalized.limit !== undefined) {
                url.searchParams.set("limit", String(normalized.limit));
            }
            return this.sanitized(validateCompatibilityResponse(await this.request(url, "GET"), normalized));
        } catch {
            return repositoryManagementUnavailableResponse();
        }
    }

    async publish(packageDocument: Uint8Array): Promise<Response> {
        if (!(packageDocument instanceof Uint8Array)) {
            return repositoryManagementUnavailableResponse();
        }
        if (packageDocument.byteLength > REPOSITORY_MANAGEMENT_UPLOAD_LIMIT_BYTES) {
            return repositoryManagementUploadTooLargeResponse();
        }
        try {
            const publication = await preparePublication(packageDocument);
            const response = await this.request(this.endpoint(PATHS.publications), "POST", publication.bytes);
            return this.sanitized(validatePublicationResponse(response, publication));
        } catch {
            return repositoryManagementUnavailableResponse();
        }
    }

    async submitCandidate(candidateDocument: Uint8Array): Promise<Response> {
        if (!(candidateDocument instanceof Uint8Array)) {
            return repositoryManagementUnavailableResponse();
        }
        if (candidateDocument.byteLength > REPOSITORY_MANAGEMENT_UPLOAD_LIMIT_BYTES) {
            return repositoryManagementUploadTooLargeResponse();
        }
        try {
            const candidate = await prepareRepositoryCandidate(candidateDocument);
            const response = await this.request(this.endpoint(PATHS.candidates), "POST", candidate.bytes);
            return this.sanitized(validateCandidateSubmissionResponse(response, candidate));
        } catch {
            return repositoryManagementUnavailableResponse();
        }
    }

    async candidateStatus(candidateId: string): Promise<Response> {
        try {
            const expected = repositoryCandidateId(candidateId);
            const url = this.endpoint(PATHS.candidateStatus);
            url.searchParams.set("candidateId", expected);
            return this.sanitized(validateCandidateStatusResponse(await this.request(url, "GET"), expected));
        } catch {
            return repositoryManagementUnavailableResponse();
        }
    }

    async candidateReport(candidateId: string): Promise<Response> {
        try {
            const expected = repositoryCandidateId(candidateId);
            const url = this.endpoint(PATHS.candidateReport);
            url.searchParams.set("candidateId", expected);
            return this.sanitized(validateCandidateReportResponse(await this.request(url, "GET"), expected));
        } catch {
            return repositoryManagementUnavailableResponse();
        }
    }

    async reevaluate(input: RepositoryReevaluationInput): Promise<Response> {
        try {
            const prepared = prepareReevaluation(input, this.actor);
            const response = await this.request(this.endpoint(PATHS.reevaluations), "POST", prepared.bytes);
            return this.sanitized(
                validateReevaluationResponse(response, {
                    input: prepared.input,
                    actor: this.actor,
                    ...(prepared.evidenceIds ? { evidenceIds: prepared.evidenceIds } : {}),
                }),
            );
        } catch {
            return repositoryManagementUnavailableResponse();
        }
    }

    async promoteStable(input: RepositoryStablePromotionInput): Promise<Response> {
        try {
            const prepared = preparePromotion(input, this.actor);
            const response = await this.request(this.endpoint(PATHS.stablePromotions), "POST", prepared.bytes);
            return this.sanitized(validatePromotionResponse(response, { input: prepared.input, actor: this.actor }));
        } catch {
            return repositoryManagementUnavailableResponse();
        }
    }

    async blockVersion(input: RepositoryVersionBlockInput): Promise<Response> {
        try {
            const prepared = prepareRepositoryVersionBlock(input, this.actor);
            const response = await this.request(this.endpoint(PATHS.versionBlocks), "POST", prepared.bytes);
            return this.sanitized(validateVersionBlockResponse(response, { input: prepared.input, actor: this.actor }));
        } catch {
            return repositoryManagementUnavailableResponse();
        }
    }

    private async execute(
        path: string,
        method: "GET" | "POST",
        body: Uint8Array | undefined,
        validate: (response: RepositoryManagementTransportResponse) => SanitizedRepositoryManagementResult,
    ): Promise<Response> {
        try {
            return this.sanitized(validate(await this.request(this.endpoint(path), method, body)));
        } catch {
            return repositoryManagementUnavailableResponse();
        }
    }

    private async request(
        url: URL,
        method: "GET" | "POST",
        body?: Uint8Array,
    ): Promise<RepositoryManagementTransportResponse> {
        return await repositoryManagementRequest({
            fetch: this.fetchImpl,
            url,
            token: this.token,
            timeoutMs: this.timeoutMs,
            method,
            ...(body ? { body } : {}),
        });
    }

    private endpoint(path: string): URL {
        return new URL(`${this.baseUrl}${path}`);
    }

    private sanitized(result: SanitizedRepositoryManagementResult): Response {
        return repositoryManagementJsonResponse(result.status, result.body, result.retryAfter);
    }
}
