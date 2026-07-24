import type { SourceOverlay, SourceOverlayRepository } from "../../interfaces/SourceOverlay";
import { memoizeRequestPromise } from "./requestScopeCache";

/** Shares overlay reads inside one request and never across requests. */
export class RequestScopedSourceOverlayRepository implements SourceOverlayRepository {
    private readonly overlays = new Map<string, Promise<SourceOverlay | null>>();
    private readonly overlaysBySource = new Map<string, Promise<SourceOverlay[]>>();
    private allOverlays: Promise<SourceOverlay[]> | undefined;

    constructor(private readonly inner: SourceOverlayRepository) {}

    async getOverlay(id: string): Promise<SourceOverlay | null> {
        const overlay = await memoizeRequestPromise(this.overlays, id, async () =>
            cloneNullable(await this.inner.getOverlay(id)),
        );
        return cloneNullable(overlay);
    }

    async getOverlaysForSource(sourceId: string): Promise<SourceOverlay[]> {
        const overlays = await memoizeRequestPromise(this.overlaysBySource, sourceId, async () =>
            structuredClone(await this.inner.getOverlaysForSource(sourceId)),
        );
        return structuredClone(overlays);
    }

    async getAllOverlays(): Promise<SourceOverlay[]> {
        if (!this.allOverlays) {
            const pending = Promise.resolve()
                .then(() => this.inner.getAllOverlays())
                .then((overlays) => structuredClone(overlays));
            this.allOverlays = pending;
            void pending.catch(() => {
                if (this.allOverlays === pending) {
                    this.allOverlays = undefined;
                }
            });
        }
        return structuredClone(await this.allOverlays);
    }

    async upsertOverlay(overlay: SourceOverlay): Promise<SourceOverlay> {
        try {
            return structuredClone(await this.inner.upsertOverlay(overlay));
        } finally {
            this.clear();
        }
    }

    async deleteOverlay(id: string): Promise<boolean> {
        try {
            return await this.inner.deleteOverlay(id);
        } finally {
            this.clear();
        }
    }

    private clear(): void {
        this.overlays.clear();
        this.overlaysBySource.clear();
        this.allOverlays = undefined;
    }
}

function cloneNullable<Value>(value: Value | null): Value | null {
    return value === null ? null : structuredClone(value);
}
