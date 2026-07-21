import type { DetailResourceOverride, DetailSelection } from "./types";

export type DashboardActionCompletion = "reuse" | "reload" | "stale";

type ActionBatch = {
    active: number;
    generation: number;
    overlapped: boolean;
};

export class DetailResourceState {
    private value: DetailResourceOverride | null = null;
    private generation = 0;
    private batch: ActionBatch | null = null;

    current(sourceId: string, dashboardId: string, detail: DetailSelection | null): DetailResourceOverride | null {
        if (!this.value) {
            return null;
        }
        const matchesDashboard = this.value.sourceId === sourceId && this.value.dashboardId === dashboardId;
        const matchesDetail = detail
            ? this.value.collection === detail.collection && this.value.row === detail.row
            : this.value.row === "";
        if (!matchesDashboard || !matchesDetail) {
            this.clear();
            return null;
        }
        return this.value;
    }

    set(sourceId: string, dashboardId: string, collection: string, row: string, resource: unknown): void {
        if (resource === undefined || resource === null) {
            this.clearResource();
            return;
        }
        this.value = { sourceId, dashboardId, collection, row, resource };
    }

    matches(sourceId: string, dashboardId: string, collection: string, row: string): boolean {
        return (
            this.value?.sourceId === sourceId &&
            this.value.dashboardId === dashboardId &&
            this.value.collection === collection &&
            this.value.row === row
        );
    }

    clear(): boolean {
        const hadValue = this.clearResource();
        this.generation += 1;
        return hadValue;
    }

    clearResource(): boolean {
        const hadValue = this.value !== null;
        this.value = null;
        return hadValue;
    }

    beginAction(): () => DashboardActionCompletion {
        let batch = this.batch;
        if (!batch || batch.generation !== this.generation) {
            batch = { active: 0, generation: this.generation, overlapped: false };
            this.batch = batch;
        } else if (batch.active > 0) {
            batch.overlapped = true;
        }
        batch.active += 1;
        let finished = false;
        return () => {
            if (finished) {
                return "stale";
            }
            finished = true;
            batch.active -= 1;
            const isCurrent = batch.generation === this.generation;
            const isLast = batch.active === 0;
            if (isLast && this.batch === batch) {
                this.batch = null;
            }
            if (!isCurrent) {
                return "stale";
            }
            if (!batch.overlapped) {
                return "reuse";
            }
            return "reload";
        };
    }
}
