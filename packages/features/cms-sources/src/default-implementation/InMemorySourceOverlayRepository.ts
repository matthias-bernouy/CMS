import type { SourceOverlay, SourceOverlayRepository } from "../interfaces/SourceOverlay";

export class InMemorySourceOverlayRepository implements SourceOverlayRepository {
    private readonly overlays = new Map<string, SourceOverlay>();

    async getOverlay(id: string): Promise<SourceOverlay | null> {
        const overlay = this.overlays.get(id);
        return overlay ? structuredClone(overlay) : null;
    }

    async getOverlaysForSource(sourceId: string): Promise<SourceOverlay[]> {
        return [...this.overlays.values()]
            .filter(overlay => overlay.sourceId === sourceId)
            .map(overlay => structuredClone(overlay));
    }

    async getAllOverlays(): Promise<SourceOverlay[]> {
        return [...this.overlays.values()].map(overlay => structuredClone(overlay));
    }

    async upsertOverlay(overlay: SourceOverlay): Promise<SourceOverlay> {
        const next = structuredClone(overlay);
        this.overlays.set(next.id, next);
        return structuredClone(next);
    }

    async deleteOverlay(id: string): Promise<boolean> {
        return this.overlays.delete(id);
    }
}
