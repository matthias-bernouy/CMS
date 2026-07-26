import { RepositoryControlRequestError } from "cms-control/core/admin/control/mountRoutes/repositoryBody";
import type {
    RepositoryCompatibilityQuery,
    RepositoryReevaluationInput,
    RepositoryStablePromotionInput,
    RepositoryVersionBlockInput,
} from "cms-control/core/admin/control/mountRoutes/repositoryGateway";

export function repositoryRequiredQuery(request: Request, name: string): string {
    const value = optionalText(new URL(request.url).searchParams.get(name));
    if (!value) {
        throw new RepositoryControlRequestError(400);
    }
    return value;
}

export function repositoryCompatibilityQuery(request: Request): RepositoryCompatibilityQuery {
    const url = new URL(request.url);
    const kind = repositoryRequiredQuery(request, "kind");
    const version = repositoryRequiredQuery(request, "version");
    const after = optionalText(url.searchParams.get("after"));
    const limitText = optionalText(url.searchParams.get("limit"));
    if (!limitText) {
        return { kind, version, ...(after ? { after } : {}) };
    }
    if (!/^[1-9][0-9]*$/u.test(limitText) || Number(limitText) > 100) {
        throw new RepositoryControlRequestError(400);
    }
    return { kind, version, ...(after ? { after } : {}), limit: Number(limitText) };
}

export function parseRepositoryReevaluation(value: unknown): RepositoryReevaluationInput {
    const object = exactObject(value, ["kind", "version", "currentReportRevisionId", "reason", "evidenceIds"]);
    const evidenceIds = object.evidenceIds;
    if (evidenceIds !== undefined && (!Array.isArray(evidenceIds) || !evidenceIds.every(isNonEmptyString))) {
        throw new RepositoryControlRequestError(400);
    }
    return {
        kind: requiredBodyText(object.kind),
        version: requiredBodyText(object.version),
        currentReportRevisionId: requiredBodyText(object.currentReportRevisionId),
        reason: requiredBodyText(object.reason),
        ...(evidenceIds ? { evidenceIds } : {}),
    };
}

export function parseRepositoryPromotion(value: unknown): RepositoryStablePromotionInput {
    const object = exactObject(value, ["kind", "version", "currentReportRevisionId", "confirmation", "reason"]);
    const confirmation = exactObject(object.confirmation, ["version", "reportRevisionId"]);
    return {
        kind: requiredBodyText(object.kind),
        version: requiredBodyText(object.version),
        currentReportRevisionId: requiredBodyText(object.currentReportRevisionId),
        confirmation: {
            version: requiredBodyText(confirmation.version),
            reportRevisionId: requiredBodyText(confirmation.reportRevisionId),
        },
        ...(object.reason === undefined ? {} : { reason: requiredBodyText(object.reason) }),
    };
}

export function parseRepositoryVersionBlock(value: unknown): RepositoryVersionBlockInput {
    const object = exactObject(value, ["kind", "version", "currentDecision", "reason", "confirmation"]);
    const currentDecision = exactObject(object.currentDecision, ["revisionId", "digest"]);
    const confirmation = exactObject(object.confirmation, [
        "action",
        "kind",
        "version",
        "decisionRevisionId",
        "decisionDigest",
    ]);
    if (confirmation.action !== "block") {
        throw new RepositoryControlRequestError(400);
    }
    const result: RepositoryVersionBlockInput = {
        kind: requiredBodyText(object.kind),
        version: requiredBodyText(object.version),
        currentDecision: {
            revisionId: requiredBodyText(currentDecision.revisionId),
            digest: requiredBodyText(currentDecision.digest),
        },
        reason: requiredBodyText(object.reason),
        confirmation: {
            action: "block",
            kind: requiredBodyText(confirmation.kind),
            version: requiredBodyText(confirmation.version),
            decisionRevisionId: requiredBodyText(confirmation.decisionRevisionId),
            decisionDigest: requiredBodyText(confirmation.decisionDigest),
        },
    };
    if (
        result.confirmation.kind !== result.kind ||
        result.confirmation.version !== result.version ||
        result.confirmation.decisionRevisionId !== result.currentDecision.revisionId ||
        result.confirmation.decisionDigest !== result.currentDecision.digest
    ) {
        throw new RepositoryControlRequestError(400);
    }
    return result;
}

function exactObject(value: unknown, allowed: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new RepositoryControlRequestError(400);
    }
    const object = value as Record<string, unknown>;
    if (!Object.keys(object).every((key) => allowed.includes(key)) || "actor" in object) {
        throw new RepositoryControlRequestError(400);
    }
    return object;
}

function requiredBodyText(value: unknown): string {
    if (!isNonEmptyString(value)) {
        throw new RepositoryControlRequestError(400);
    }
    return value;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && Boolean(value.trim());
}

function optionalText(value: string | null): string | undefined {
    return value?.trim() || undefined;
}
