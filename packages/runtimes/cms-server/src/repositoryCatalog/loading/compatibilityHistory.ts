import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { IntegrationRepositoryContractError } from "@bernouy/cms-integrations";
import type { PublicRepositoryCompatibilityPage } from "@bernouy/cms-repository";
import type { HttpRepositoryCompatibilityReader } from "../compatibility/reader";
import { BoundedCatalogWork, type RepositoryCatalogReaderLimits } from "../limits";
import { compatibilityHistory } from "./projection";

const PAGE_SIZE = 100;

export type LoadedCompatibility = Readonly<{
    history?: ReturnType<typeof compatibilityHistory>;
    validators: readonly string[];
}>;

export async function loadCatalogCompatibility(
    reader: HttpRepositoryCompatibilityReader,
    limits: RepositoryCatalogReaderLimits,
    kind: string,
    version: string,
    work: BoundedCatalogWork,
): Promise<LoadedCompatibility> {
    const validators: string[] = [];
    const revisions: PublicRepositoryCompatibilityPage["revisions"][number][] = [];
    let after: string | undefined;
    let first: Awaited<ReturnType<HttpRepositoryCompatibilityReader["listDocument"]>> = null;
    const cursors = new Set<string>();
    const reportIds = new Set<string>();
    let pages = 0;
    do {
        pages += 1;
        if (pages > Math.ceil(limits.compatibilityRevisions / PAGE_SIZE) + 1) {
            throw new IntegrationRepositoryContractError();
        }
        const document = await work.run(() =>
            reader.listDocument(kind, version, { limit: PAGE_SIZE, ...(after ? { after } : {}) }),
        );
        if (!document) {
            if (!first) {
                return { validators };
            }
            throw new IntegrationRepositoryContractError();
        }
        if (!first) {
            first = document;
            reportIds.add(document.value.root.reportId);
        }
        assertStablePage(document.value, first.value);
        if (document.value.totalRevisions > limits.compatibilityRevisions) {
            throw new IntegrationRepositoryContractError();
        }
        for (const revision of document.value.revisions) {
            if (reportIds.has(revision.reportId)) {
                throw new IntegrationRepositoryContractError();
            }
            reportIds.add(revision.reportId);
            revisions.push(revision);
        }
        validators.push(`compatibility:${kind}@${version}:${document.etag}`);
        after = document.value.nextCursor;
        if (after && cursors.has(after)) {
            throw new IntegrationRepositoryContractError();
        }
        if (after) {
            cursors.add(after);
        }
    } while (after);
    if (!first || revisions.length !== first.value.totalRevisions) {
        throw new IntegrationRepositoryContractError();
    }
    return { history: compatibilityHistory(first.value, revisions), validators };
}

function assertStablePage(value: PublicRepositoryCompatibilityPage, first: PublicRepositoryCompatibilityPage): void {
    if (
        value.totalRevisions !== first.totalRevisions ||
        !sameValue(value.root, first.root) ||
        !sameValue(value.current, first.current)
    ) {
        throw new IntegrationRepositoryContractError();
    }
}

function sameValue(left: unknown, right: unknown): boolean {
    const leftBytes = canonicalJsonBytes(left);
    const rightBytes = canonicalJsonBytes(right);
    return (
        leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index])
    );
}
