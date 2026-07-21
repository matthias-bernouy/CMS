import type { SourceOverlay, SourceOverlayRepository } from "@bernouy/cms-sources";
import type { IntegrationArtifactResult } from "../../interfaces/IntegrationImport";

export type IntegrationSourceOverlayWrite = {
    overlay: SourceOverlay;
    previous: SourceOverlay | null;
};

export function writeSourceOverlaysWithRollback(
    repository: SourceOverlayRepository,
    writes: IntegrationSourceOverlayWrite[],
): Promise<IntegrationArtifactResult[]>;
export function writeSourceOverlaysWithRollback<T>(
    repository: SourceOverlayRepository,
    writes: IntegrationSourceOverlayWrite[],
    operation: (artifacts: IntegrationArtifactResult[]) => Promise<T>,
): Promise<T>;
export async function writeSourceOverlaysWithRollback<T>(
    repository: SourceOverlayRepository,
    writes: IntegrationSourceOverlayWrite[],
    operation?: (artifacts: IntegrationArtifactResult[]) => Promise<T>,
): Promise<T> {
    const completed: IntegrationSourceOverlayWrite[] = [];
    const artifacts: IntegrationArtifactResult[] = [];

    try {
        for (const write of writes) {
            await repository.upsertOverlay(write.overlay);
            completed.push(write);
            artifacts.push({
                type: "sourceOverlay",
                id: write.overlay.id,
                action: write.previous ? "updated" : "created",
            });
        }
        return operation ? await operation(artifacts) : (artifacts as T);
    } catch (error) {
        await rollbackSourceOverlays(repository, completed);
        throw error;
    }
}

async function rollbackSourceOverlays(
    repository: SourceOverlayRepository,
    completed: IntegrationSourceOverlayWrite[],
): Promise<void> {
    for (const write of completed.reverse()) {
        try {
            if (write.previous) {
                await repository.upsertOverlay(write.previous);
            } else {
                await repository.deleteOverlay(write.overlay.id);
            }
        } catch {
            // Best-effort rollback: keep restoring remaining overlays.
        }
    }
}
