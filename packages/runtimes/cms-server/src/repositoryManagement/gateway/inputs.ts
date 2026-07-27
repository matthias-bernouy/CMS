import type {
    RepositoryCompatibilityQuery,
    RepositoryReevaluationInput,
    RepositoryStablePromotionInput,
} from "@bernouy/cms-control";
import { REPOSITORY_MANAGEMENT_UPLOAD_LIMIT_BYTES } from "./transport";
import { assertEqual, canonicalText, digest, packageKind, packageVersion, uniqueTextArray } from "./validation/helpers";

const utf8 = new TextEncoder();

export type PreparedReevaluation = Readonly<{
    bytes: Uint8Array;
    input: RepositoryReevaluationInput;
    evidenceIds?: readonly string[];
}>;

export type PreparedPromotion = Readonly<{
    bytes: Uint8Array;
    input: RepositoryStablePromotionInput;
}>;

export function prepareReevaluation(input: RepositoryReevaluationInput, actor: string): PreparedReevaluation {
    const kind = packageKind(input.kind);
    const version = packageVersion(input.version);
    const currentReportRevisionId = canonicalText(input.currentReportRevisionId, 512);
    const currentDecision = {
        revisionId: canonicalText(input.currentDecision.revisionId, 512),
        digest: digest(input.currentDecision.digest),
    };
    const reason = canonicalText(input.reason, 4_096);
    const evidenceIds = input.evidenceIds ? [...uniqueTextArray(input.evidenceIds, 128)].sort() : undefined;
    const normalized: RepositoryReevaluationInput = {
        kind,
        version,
        currentReportRevisionId,
        currentDecision,
        reason,
        ...(evidenceIds ? { evidenceIds } : {}),
    };
    return {
        input: normalized,
        ...(evidenceIds ? { evidenceIds } : {}),
        bytes: jsonBytes({ ...normalized, actor }),
    };
}

export function preparePromotion(input: RepositoryStablePromotionInput, actor: string): PreparedPromotion {
    const kind = packageKind(input.kind);
    const version = packageVersion(input.version);
    const currentReportRevisionId = canonicalText(input.currentReportRevisionId, 512);
    const confirmationVersion = packageVersion(input.confirmation.version);
    const confirmationReportRevisionId = canonicalText(input.confirmation.reportRevisionId, 512);
    assertEqual(confirmationVersion, version);
    assertEqual(confirmationReportRevisionId, currentReportRevisionId);
    const reason = input.reason === undefined ? undefined : canonicalText(input.reason, 4_096);
    const normalized: RepositoryStablePromotionInput = {
        kind,
        version,
        currentReportRevisionId,
        confirmation: { version: confirmationVersion, reportRevisionId: confirmationReportRevisionId },
        ...(reason ? { reason } : {}),
    };
    return { input: normalized, bytes: jsonBytes({ ...normalized, actor }) };
}

export function normalizeManagementBaseUrl(value: unknown): string {
    if (typeof value !== "string" || value.trim() !== value) {
        throw new TypeError("Repository management base URL is invalid");
    }
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new TypeError("Repository management base URL is invalid");
    }
    if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    ) {
        throw new TypeError("Repository management base URL is invalid");
    }
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    return url.href.replace(/\/$/u, "");
}

export function normalizeManagementToken(value: unknown): string {
    if (typeof value !== "string" || value.length === 0 || value.length > 8_192 || /\s/u.test(value)) {
        throw new TypeError("Repository management token is invalid");
    }
    return value;
}

export function normalizeManagementTimeout(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 120_000) {
        throw new RangeError("Repository management timeout is invalid");
    }
    return value as number;
}

export function normalizeCompatibilityQuery(query: RepositoryCompatibilityQuery): RepositoryCompatibilityQuery {
    const kind = packageKind(query.kind);
    const version = packageVersion(query.version);
    const after = query.after === undefined ? undefined : canonicalText(query.after, 512);
    const limit = query.limit;
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)) {
        throw new TypeError("Repository compatibility limit is invalid");
    }
    return { kind, version, ...(after ? { after } : {}), ...(limit === undefined ? {} : { limit }) };
}

function jsonBytes(value: unknown): Uint8Array {
    const bytes = utf8.encode(JSON.stringify(value));
    if (bytes.byteLength > REPOSITORY_MANAGEMENT_UPLOAD_LIMIT_BYTES) {
        throw new TypeError("Repository management JSON request is too large");
    }
    return bytes;
}
