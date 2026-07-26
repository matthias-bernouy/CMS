import { opendir } from "node:fs/promises";
import { join } from "node:path";
import {
    IntegrationCompatibilityHistoryNotFoundError,
    IntegrationCompatibilityRevisionConflictError,
    IntegrationCompatibilityRevisionValidationError,
} from "../../../../core/compatibility/reportStoreErrors";
import { InMemoryIntegrationCompatibilityReportHistory } from "../../../../core/compatibility/history";
import type { IntegrationRegistryCatalogSnapshotProvider } from "../../../../interfaces/catalog";
import type { IntegrationCompatibilityReportRevision } from "../../../../interfaces/compatibility";
import type {
    IntegrationCompatibilityReportCollection,
    IntegrationCompatibilityReportPage,
    IntegrationCompatibilityReportPageRequest,
    IntegrationCompatibilityReportStore,
} from "../../../../interfaces/reportStore";
import type { IntegrationRegistryMutationCoordinator } from "../../../../interfaces/mutations";
import { readCompatibilityAdmissionReport } from "../persistence/report";
import { withVerifiedRegistryDirectory } from "../persistence/ownedDirectory";
import {
    ensureIntegrationCompatibilityRevisionDirectory,
    integrationCompatibilityHistoryPaths,
    integrationCompatibilityRevisionFilename,
} from "./layout";
import { compatibilityHistoryPage } from "./page";
import { parseCompatibilityRevision, readCompatibilityRevision, writeCompatibilityRevision } from "./revisionDocument";

const MAX_REVISIONS = 4_096;

export type FsIntegrationCompatibilityReportStoreConfig = Readonly<{
    snapshots: IntegrationRegistryCatalogSnapshotProvider;
    mutations: IntegrationRegistryMutationCoordinator;
}>;

export class FsIntegrationCompatibilityReportStore implements IntegrationCompatibilityReportStore {
    constructor(private readonly config: FsIntegrationCompatibilityReportStoreConfig) {}

    async get(kind: string, version: string): Promise<IntegrationCompatibilityReportCollection | null> {
        const location = this.config.snapshots.current().locateExactVersion(kind, version);
        if (!location) {
            return null;
        }
        return await readFsIntegrationCompatibilityReportCollection(location);
    }

    async list(
        kind: string,
        version: string,
        page: IntegrationCompatibilityReportPageRequest = {},
    ): Promise<IntegrationCompatibilityReportPage | null> {
        const history = await this.get(kind, version);
        if (!history) {
            return null;
        }
        return compatibilityHistoryPage(history, page);
    }

    async appendRevision(
        input: IntegrationCompatibilityReportRevision,
    ): Promise<IntegrationCompatibilityReportCollection> {
        let revision: IntegrationCompatibilityReportRevision;
        try {
            revision = parseCompatibilityRevision(input);
        } catch (error) {
            throw new IntegrationCompatibilityRevisionValidationError("Compatibility revision is invalid", {
                cause: error,
            });
        }
        return await this.config.mutations.runExclusive(revision.kind, async () => {
            const location = this.config.snapshots.current().locateExactVersion(revision.kind, revision.version);
            if (!location || location.package.digest !== revision.packageDigest) {
                throw new IntegrationCompatibilityHistoryNotFoundError(revision.kind, revision.version);
            }
            const loaded = await loadHistory(location);
            if (!loaded) {
                throw new IntegrationCompatibilityHistoryNotFoundError(revision.kind, revision.version);
            }
            if (loaded.collection.reports.some((report) => report.id === revision.id)) {
                throw new IntegrationCompatibilityRevisionConflictError(revision.id);
            }
            if (revision.supersedes !== loaded.collection.current.id) {
                throw new IntegrationCompatibilityRevisionConflictError(
                    revision.id,
                    `Compatibility revision must supersede current report "${loaded.collection.current.id}"`,
                );
            }
            try {
                loaded.history.append(revision);
            } catch (error) {
                throw new IntegrationCompatibilityRevisionValidationError(errorMessage(error), { cause: error });
            }
            const revisions = await ensureIntegrationCompatibilityRevisionDirectory(loaded.paths);
            const path = join(revisions, integrationCompatibilityRevisionFilename(revision.id));
            try {
                await writeCompatibilityRevision(path, revision);
            } catch (error) {
                if (isNodeError(error) && error.code === "EEXIST") {
                    throw new IntegrationCompatibilityRevisionConflictError(revision.id);
                }
                throw error;
            }
            return (await loadHistory(location))!.collection;
        });
    }
}

export async function readFsIntegrationCompatibilityReportCollection(
    location: Parameters<typeof integrationCompatibilityHistoryPaths>[0],
): Promise<IntegrationCompatibilityReportCollection | null> {
    return (await loadHistory(location))?.collection ?? null;
}

async function loadHistory(location: Parameters<typeof integrationCompatibilityHistoryPaths>[0]) {
    const paths = integrationCompatibilityHistoryPaths(location);
    const admission = await readCompatibilityAdmissionReport(paths.admission, {
        kind: location.kind,
        version: location.version,
        digest: location.package.digest,
    });
    if (!admission) {
        return null;
    }
    const history = new InMemoryIntegrationCompatibilityReportHistory(admission);
    const revisions = await readRevisionDirectory(paths.revisions);
    const remaining = new Map(revisions.map((revision) => [revision.id, revision]));
    while (remaining.size > 0) {
        const successors = [...remaining.values()].filter((revision) => revision.supersedes === history.current().id);
        if (successors.length !== 1) {
            throw new Error("Integration compatibility revision history is branched or disconnected");
        }
        history.append(successors[0]!);
        remaining.delete(successors[0]!.id);
    }
    return { history, paths, collection: collection(history) };
}

async function readRevisionDirectory(path: string): Promise<readonly IntegrationCompatibilityReportRevision[]> {
    try {
        return await withVerifiedRegistryDirectory(path, async (descriptorPath) => {
            const handle = await opendir(descriptorPath);
            const reports: IntegrationCompatibilityReportRevision[] = [];
            for await (const entry of handle) {
                if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json")) {
                    throw new Error(`Invalid integration compatibility revision entry: ${join(path, entry.name)}`);
                }
                const report = await readCompatibilityRevision(join(descriptorPath, entry.name));
                if (!report || entry.name !== integrationCompatibilityRevisionFilename(report.id)) {
                    throw new Error(
                        `Integration compatibility revision filename does not match its report ID: ${entry.name}`,
                    );
                }
                reports.push(report);
                if (reports.length > MAX_REVISIONS) {
                    throw new Error(`Integration compatibility history exceeds ${MAX_REVISIONS} revisions`);
                }
            }
            return reports;
        });
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}

function collection(history: InMemoryIntegrationCompatibilityReportHistory): IntegrationCompatibilityReportCollection {
    return Object.freeze({ admission: history.admission(), current: history.current(), reports: history.list() });
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return typeof value === "object" && value !== null && "code" in value;
}

function errorMessage(value: unknown): string {
    return value instanceof Error ? value.message : String(value);
}
