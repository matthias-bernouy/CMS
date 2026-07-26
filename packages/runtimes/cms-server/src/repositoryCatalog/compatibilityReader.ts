import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import { IntegrationRepositoryContractError } from "@bernouy/cms-integrations";
import type {
    RepositoryCompatibilityPageRequest,
    RepositoryCompatibilityPageSource,
    RepositoryCompatibilityReader,
} from "@bernouy/cms-repository";
import { array, parseCompatibilityReport, record, text } from "./compatibilityReport";
import { RepositoryCatalogHttpTransport, type RepositoryHttpDocument } from "./transport";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;
const MAX_PAGE_SIZE = 100;
const MAX_TOTAL_REVISIONS = 4_096;

export type HttpRepositoryCompatibilityReaderConfig = Readonly<{
    baseUrl: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
    maxResponseBytes?: number;
}>;

export class HttpRepositoryCompatibilityReader implements RepositoryCompatibilityReader {
    private readonly transport: RepositoryCatalogHttpTransport;
    private readonly maxResponseBytes: number;

    constructor(config: HttpRepositoryCompatibilityReaderConfig) {
        this.transport = new RepositoryCatalogHttpTransport({
            baseUrl: config.baseUrl,
            ...(config.fetch ? { fetch: config.fetch } : {}),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });
        this.maxResponseBytes = positiveLimit(config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES);
    }

    async list(
        kind: string,
        version: string,
        page: RepositoryCompatibilityPageRequest = {},
    ): Promise<RepositoryCompatibilityPageSource | null> {
        return (await this.listDocument(kind, version, page))?.value ?? null;
    }

    async listDocument(
        kind: string,
        version: string,
        page: RepositoryCompatibilityPageRequest = {},
    ): Promise<RepositoryHttpDocument<RepositoryCompatibilityPageSource> | null> {
        const identity = validatedIdentity(kind, version);
        const normalizedPage = validatedPage(page);
        const params = new URLSearchParams({ kind: identity.kind, version: identity.version });
        params.set("limit", String(normalizedPage.limit));
        if (normalizedPage.after) {
            params.set("after", normalizedPage.after);
        }
        const document = await this.transport.getJson(
            `api/integrations/compatibility?${params.toString()}`,
            this.maxResponseBytes,
        );
        if (!document) {
            return null;
        }
        return {
            value: parseCompatibilityPage(document.value, identity, normalizedPage),
            etag: document.etag,
        };
    }
}

function parseCompatibilityPage(
    value: unknown,
    identity: Readonly<{ kind: string; version: string }>,
    page: Readonly<{ after?: string; limit: number }>,
): RepositoryCompatibilityPageSource {
    const source = record(value);
    const required = ["admission", "current", "revisions", "totalRevisions"];
    const keys = Object.keys(source);
    if (
        !required.every((key) => keys.includes(key)) ||
        keys.some((key) => ![...required, "nextCursor"].includes(key))
    ) {
        throw new IntegrationRepositoryContractError();
    }
    const admission = parseCompatibilityReport(source.admission, identity.kind, identity.version);
    const current = parseCompatibilityReport(source.current, identity.kind, identity.version);
    if (admission.reportType !== "admission") {
        throw new IntegrationRepositoryContractError();
    }
    const revisions = array(source.revisions, page.limit).map((entry) => {
        const report = parseCompatibilityReport(entry, identity.kind, identity.version);
        if (report.reportType !== "revision") {
            throw new IntegrationRepositoryContractError();
        }
        return report;
    });
    const totalRevisions = safeCount(source.totalRevisions, MAX_TOTAL_REVISIONS);
    const nextCursor = source.nextCursor === undefined ? undefined : text(source.nextCursor, 256);
    for (const report of [current, ...revisions]) {
        if (report.packageDigest !== admission.packageDigest) {
            throw new IntegrationRepositoryContractError();
        }
    }
    if (
        (totalRevisions === 0 && current.reportType !== "admission") ||
        (totalRevisions > 0 && current.reportType !== "revision")
    ) {
        throw new IntegrationRepositoryContractError();
    }
    assertPageChain(admission.id, current.id, revisions, totalRevisions, page.after, nextCursor);
    return { admission, current, revisions, totalRevisions, ...(nextCursor ? { nextCursor } : {}) };
}

function assertPageChain(
    admissionId: string,
    currentId: string,
    revisions: RepositoryCompatibilityPageSource["revisions"],
    totalRevisions: number,
    after: string | undefined,
    nextCursor: string | undefined,
): void {
    let previous = after ?? admissionId;
    const ids = new Set([admissionId]);
    for (const revision of revisions) {
        if (ids.has(revision.id) || revision.supersedes !== previous) {
            throw new IntegrationRepositoryContractError();
        }
        ids.add(revision.id);
        previous = revision.id;
    }
    if (nextCursor !== undefined && (revisions.length === 0 || nextCursor !== previous)) {
        throw new IntegrationRepositoryContractError();
    }
    if (!nextCursor && previous !== currentId) {
        throw new IntegrationRepositoryContractError();
    }
    if ((totalRevisions === 0) !== (currentId === admissionId) || totalRevisions < revisions.length) {
        throw new IntegrationRepositoryContractError();
    }
    if (
        (!after && !nextCursor && revisions.length !== totalRevisions) ||
        (nextCursor && totalRevisions <= revisions.length)
    ) {
        throw new IntegrationRepositoryContractError();
    }
}

function validatedIdentity(kind: string, version: string): { kind: string; version: string } {
    try {
        return { kind: assertIntegrationPackageKind(kind), version: assertIntegrationPackageVersion(version) };
    } catch {
        throw new IntegrationRepositoryContractError();
    }
}

function validatedPage(page: RepositoryCompatibilityPageRequest): { after?: string; limit: number } {
    const source = record(page);
    if (!Object.keys(source).every((key) => ["after", "limit"].includes(key))) {
        throw new IntegrationRepositoryContractError();
    }
    const limit = source.limit === undefined ? 50 : safeCount(source.limit, MAX_PAGE_SIZE, true);
    const after = source.after === undefined ? undefined : text(source.after, 256);
    return { limit, ...(after ? { after } : {}) };
}

function safeCount(value: unknown, maximum: number, positive = false): number {
    if (!Number.isSafeInteger(value) || (value as number) < (positive ? 1 : 0) || (value as number) > maximum) {
        throw new IntegrationRepositoryContractError();
    }
    return value as number;
}

function positiveLimit(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new RangeError("Compatibility response limit must be a positive safe integer");
    }
    return value;
}
