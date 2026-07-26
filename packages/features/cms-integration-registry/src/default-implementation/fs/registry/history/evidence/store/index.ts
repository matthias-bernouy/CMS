import { lstat } from "node:fs/promises";
import { join } from "node:path";
import {
    ReleaseReportIntegrityError,
    ReleaseReportValidationError,
} from "../../../../../../core/compatibility/reportStoreErrors";
import type { IntegrationRegistryCatalogSnapshotProvider } from "../../../../../../interfaces/catalog";
import type { IntegrationRegistryMutationCoordinator } from "../../../../../../interfaces/mutations";
import type { AppendReleaseReportRequest, ReleaseReportHistory } from "../../../../../../interfaces/reportStore";
import { writeReleaseReportRevision } from "../document";
import { ensureReleaseReportIdentity, loadReleaseReportHistory } from "../history";
import {
    assertReleaseReportHistoryCapacity,
    ensureReleaseReportHistoryPaths,
    releaseReportHistoryPaths,
    releaseReportRevisionFilename,
    verifyReleaseReportHistoryPaths,
} from "../layout";
import type { FsReleaseReportHistoryAdapter } from "../types";
import { assertAppendShape, assertExpectedCurrent, conflict, releaseReportLimits } from "./validation";

export type FsReleaseReportHistoryStoreConfig = Readonly<{
    root: string;
    snapshots: IntegrationRegistryCatalogSnapshotProvider;
    mutations: IntegrationRegistryMutationCoordinator;
    limits?: Readonly<{
        historiesPerStream?: number;
        revisionsPerHistory?: number;
    }>;
}>;

export class FsReleaseReportHistoryStore<T, K> {
    constructor(
        private readonly config: FsReleaseReportHistoryStoreConfig,
        readonly adapter: FsReleaseReportHistoryAdapter<T, K>,
    ) {}

    async get(key: K): Promise<ReleaseReportHistory<T> | null> {
        const paths = await releaseReportHistoryPaths(this.config.root, this.adapter.stream, key);
        try {
            const metadata = await lstat(paths.historyRoot);
            if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
                throw new ReleaseReportIntegrityError(
                    `Release report ${this.adapter.stream} history must be a real directory`,
                );
            }
            await verifyReleaseReportHistoryPaths(paths);
            const history = await loadReleaseReportHistory(paths.historyRoot, this.adapter, key);
            if (history) {
                this.adapter.assertCatalog(this.config.snapshots.current(), history.current);
            }
            return history;
        } catch (error) {
            if (isNodeError(error) && error.code === "ENOENT") {
                return null;
            }
            throw error;
        }
    }

    async append(
        request: AppendReleaseReportRequest<T>,
        validateUnderLock?: (report: T) => Promise<void>,
    ): Promise<ReleaseReportHistory<T>> {
        let identified: Awaited<ReturnType<typeof this.adapter.identify>>;
        try {
            identified = await this.adapter.identify(request.report);
            this.adapter.assertCatalog(this.config.snapshots.current(), identified.report);
        } catch (error) {
            throw new ReleaseReportValidationError(`Release report ${this.adapter.stream} is invalid`, {
                cause: error,
            });
        }
        const key = this.adapter.key(identified.report);
        return await this.config.mutations.runExclusive(this.adapter.mutationKind(key), async () => {
            this.adapter.assertCatalog(this.config.snapshots.current(), identified.report);
            await validateUnderLock?.(identified.report);
            const limits = releaseReportLimits(this.config);
            const intendedPaths = await releaseReportHistoryPaths(this.config.root, this.adapter.stream, key);
            if (!(await pathExists(intendedPaths.historyRoot))) {
                assertExpectedCurrent(null, request.expectedCurrent, this.adapter.stream);
                assertAppendShape(null, identified.report, this.adapter);
            }
            await assertReleaseReportHistoryCapacity(
                this.config.root,
                this.adapter.stream,
                key,
                limits.historiesPerStream,
            );
            const paths = await ensureReleaseReportHistoryPaths(this.config.root, this.adapter.stream, key);
            await verifyReleaseReportHistoryPaths(paths);
            await ensureReleaseReportIdentity(paths.identity, key, this.adapter);
            const before = await loadReleaseReportHistory(paths.historyRoot, this.adapter, key, true);
            const existing = before?.revisions.find(
                (report) => this.adapter.revisionId(report) === this.adapter.revisionId(identified.report),
            );
            if (existing) {
                if ((await this.adapter.identify(existing)).digest !== identified.digest) {
                    throw conflict(this.adapter.stream, "revision ID already has different content");
                }
                return before!;
            }
            assertExpectedCurrent(before, request.expectedCurrent, this.adapter.stream);
            assertAppendShape(before, identified.report, this.adapter);
            if ((before?.revisions.length ?? 0) >= limits.revisionsPerHistory) {
                throw new ReleaseReportValidationError(
                    `Release report ${this.adapter.stream} history already contains ${limits.revisionsPerHistory} revisions`,
                );
            }
            const ordinal = (before?.revisions.length ?? 0) + 1;
            try {
                await writeReleaseReportRevision(
                    join(paths.revisions, releaseReportRevisionFilename(ordinal)),
                    ordinal,
                    identified.report,
                    this.adapter,
                );
            } catch (error) {
                if (!isNodeError(error) || error.code !== "EEXIST") {
                    throw error;
                }
            }
            const after = await loadReleaseReportHistory(paths.historyRoot, this.adapter, key);
            const committed = after?.revisions.find(
                (report) => this.adapter.revisionId(report) === this.adapter.revisionId(identified.report),
            );
            if (!after || !committed || (await this.adapter.identify(committed)).digest !== identified.digest) {
                throw conflict(this.adapter.stream, "lost a concurrent compare-and-swap");
            }
            return after;
        });
    }
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return false;
        }
        throw error;
    }
}
