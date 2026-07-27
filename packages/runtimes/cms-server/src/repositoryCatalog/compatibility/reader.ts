import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import { IntegrationRepositoryContractError } from "@bernouy/cms-integrations";
import type {
    PublicRepositoryCompatibilityPage,
    PublicRepositoryCompatibilityReport,
    RepositoryCompatibilityPageRequest,
    RepositoryProjectedCompatibilityReader,
} from "@bernouy/cms-repository";
import { isDeepStrictEqual } from "node:util";
import { RepositoryCatalogHttpTransport, type RepositoryHttpDocument } from "../transport";
import { array, parseCompatibilityReport, record, text } from "./report";

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

export class HttpRepositoryCompatibilityReader implements RepositoryProjectedCompatibilityReader {
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
    ): Promise<PublicRepositoryCompatibilityPage | null> {
        return (await this.listDocument(kind, version, page))?.value ?? null;
    }

    async listDocument(
        kind: string,
        version: string,
        page: RepositoryCompatibilityPageRequest = {},
    ): Promise<RepositoryHttpDocument<PublicRepositoryCompatibilityPage> | null> {
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
): PublicRepositoryCompatibilityPage {
    const source = record(value);
    const required = ["root", "current", "revisions", "totalRevisions"];
    const keys = Object.keys(source);
    if (
        !required.every((key) => keys.includes(key)) ||
        keys.some((key) => ![...required, "nextCursor"].includes(key))
    ) {
        throw new IntegrationRepositoryContractError();
    }
    const root = parseCompatibilityReport(source.root, identity.kind, identity.version);
    const current = parseCompatibilityReport(source.current, identity.kind, identity.version);
    if (root.revisionType !== "root") {
        throw new IntegrationRepositoryContractError();
    }
    const revisions = array(source.revisions, page.limit).map((entry) => {
        const report = parseCompatibilityReport(entry, identity.kind, identity.version);
        if (report.revisionType !== "revision") {
            throw new IntegrationRepositoryContractError();
        }
        return report;
    });
    const totalRevisions = safeCount(source.totalRevisions, MAX_TOTAL_REVISIONS);
    const nextCursor = source.nextCursor === undefined ? undefined : text(source.nextCursor, 256);
    for (const report of [current, ...revisions]) {
        if (report.packageDigest !== root.packageDigest) {
            throw new IntegrationRepositoryContractError();
        }
    }
    assertPageChain(root, current, revisions, totalRevisions, page.after, nextCursor);
    return { root, current, revisions, totalRevisions, ...(nextCursor ? { nextCursor } : {}) };
}

function assertPageChain(
    root: PublicRepositoryCompatibilityPage["root"],
    current: PublicRepositoryCompatibilityReport,
    revisions: PublicRepositoryCompatibilityPage["revisions"],
    totalRevisions: number,
    after: string | undefined,
    nextCursor: string | undefined,
): void {
    const rootId = root.reportId;
    const currentId = current.reportId;
    let previous = after ?? rootId;
    const ids = new Set([rootId, ...(after ? [after] : [])]);
    for (const revision of revisions) {
        if (ids.has(revision.reportId) || revision.supersedes !== previous) {
            throw new IntegrationRepositoryContractError();
        }
        ids.add(revision.reportId);
        previous = revision.reportId;
    }
    if (nextCursor !== undefined && (revisions.length === 0 || nextCursor !== previous)) {
        throw new IntegrationRepositoryContractError();
    }
    if (!nextCursor && previous !== currentId) {
        throw new IntegrationRepositoryContractError();
    }
    if (totalRevisions === 0) {
        if (after || nextCursor || revisions.length > 0 || !isDeepStrictEqual(current, root)) {
            throw new IntegrationRepositoryContractError();
        }
        return;
    }
    if (current.revisionType !== "revision" || currentId === rootId || totalRevisions < revisions.length) {
        throw new IntegrationRepositoryContractError();
    }
    if (
        (!after && !nextCursor && revisions.length !== totalRevisions) ||
        (nextCursor && totalRevisions <= revisions.length)
    ) {
        throw new IntegrationRepositoryContractError();
    }
    if (nextCursor && ids.has(currentId)) {
        throw new IntegrationRepositoryContractError();
    }
    const last = revisions.at(-1);
    if (!nextCursor && last && !isDeepStrictEqual(current, last)) {
        throw new IntegrationRepositoryContractError();
    }
    if (!nextCursor && after && !last && currentId !== after) {
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
