import {
    IntegrationRegistryCatalogSnapshotReference,
    type IntegrationRegistryCatalogSnapshot,
    type IntegrationRegistryCatalogSnapshotProvider,
} from "@bernouy/cms-integration-registry";

export type RepositoryCatalogRuntimeStatus = Readonly<{
    status: "healthy" | "degraded" | "unready";
    ready: boolean;
    revision: number;
    snapshotHealth?: "healthy" | "degraded";
    integrations: number;
    diagnostics: number;
    quarantined: number;
    lastRefreshFailed: boolean;
    lastRefreshAttemptAt?: string;
    lastSuccessfulRefreshAt?: string;
}>;

export type RepositoryCatalogRefreshResult = Readonly<{
    applied: boolean;
    status: RepositoryCatalogRuntimeStatus;
}>;

export class RepositoryCatalogRuntime implements IntegrationRegistryCatalogSnapshotProvider {
    private reference?: IntegrationRegistryCatalogSnapshotReference;
    private revision = 0;
    private lastRefreshFailed = false;
    private lastRefreshAttemptAt?: string;
    private lastSuccessfulRefreshAt?: string;
    private refreshQueue = Promise.resolve();

    constructor(private readonly now: () => Date = () => new Date()) {}

    current(): IntegrationRegistryCatalogSnapshot {
        if (!this.reference) {
            throw new Error("Integration repository catalog snapshot is not ready");
        }
        return this.reference.current();
    }

    refresh(loader: () => Promise<IntegrationRegistryCatalogSnapshot>): Promise<RepositoryCatalogRefreshResult> {
        const refresh = this.refreshQueue.then(() => this.performRefresh(loader));
        this.refreshQueue = refresh.then(
            () => undefined,
            () => undefined,
        );
        return refresh;
    }

    status(): RepositoryCatalogRuntimeStatus {
        const snapshot = this.reference?.current();
        const ready = snapshot !== undefined;
        const degraded = this.lastRefreshFailed || snapshot?.health === "degraded";
        return Object.freeze({
            status: ready ? (degraded ? "degraded" : "healthy") : "unready",
            ready,
            revision: this.revision,
            ...(snapshot ? { snapshotHealth: snapshot.health } : {}),
            integrations: snapshot?.summaries.length ?? 0,
            diagnostics: snapshot?.diagnostics.length ?? 0,
            quarantined: snapshot?.quarantined.length ?? 0,
            lastRefreshFailed: this.lastRefreshFailed,
            ...(this.lastRefreshAttemptAt ? { lastRefreshAttemptAt: this.lastRefreshAttemptAt } : {}),
            ...(this.lastSuccessfulRefreshAt ? { lastSuccessfulRefreshAt: this.lastSuccessfulRefreshAt } : {}),
        });
    }

    private async performRefresh(
        loader: () => Promise<IntegrationRegistryCatalogSnapshot>,
    ): Promise<RepositoryCatalogRefreshResult> {
        this.lastRefreshAttemptAt = this.now().toISOString();
        try {
            const snapshot = await loader();
            if (this.reference) {
                this.reference.swap(snapshot);
            } else {
                this.reference = new IntegrationRegistryCatalogSnapshotReference(snapshot);
            }
            this.revision += 1;
            this.lastRefreshFailed = false;
            this.lastSuccessfulRefreshAt = this.now().toISOString();
            return { applied: true, status: this.status() };
        } catch {
            this.lastRefreshFailed = true;
            return { applied: false, status: this.status() };
        }
    }
}
