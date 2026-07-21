import type { Source, SourceRepository } from "@bernouy/cms-sources";
import { IntegrationRuntimeError } from "../errors";
import type { IntegrationArtifactResult } from "../../interfaces/IntegrationImport";

export type IntegrationSourceWrite = {
    source: Source;
    previous: Source | null;
};

export function writeSourcesWithRollback(
    sourceRepository: SourceRepository,
    writes: IntegrationSourceWrite[],
): Promise<IntegrationArtifactResult[]>;
export function writeSourcesWithRollback<T>(
    sourceRepository: SourceRepository,
    writes: IntegrationSourceWrite[],
    operation: (artifacts: IntegrationArtifactResult[]) => Promise<T>,
): Promise<T>;
export async function writeSourcesWithRollback<T>(
    sourceRepository: SourceRepository,
    writes: IntegrationSourceWrite[],
    operation?: (artifacts: IntegrationArtifactResult[]) => Promise<T>,
): Promise<T> {
    const completed: IntegrationSourceWrite[] = [];
    const artifacts: IntegrationArtifactResult[] = [];

    try {
        for (const write of writes) {
            if (write.previous) {
                const updated = await sourceRepository.updateSource(write.source);
                if (!updated) {
                    throw new IntegrationRuntimeError(`source disappeared during import: ${write.source.urn}`, 409);
                }
                completed.push(write);
                artifacts.push({ type: "source", id: write.source.urn, action: "updated" });
            } else {
                await sourceRepository.createSource(write.source);
                completed.push(write);
                artifacts.push({ type: "source", id: write.source.urn, action: "created" });
            }
        }
        return operation ? await operation(artifacts) : (artifacts as T);
    } catch (error) {
        await rollbackSources(sourceRepository, completed);
        throw error;
    }
}

async function rollbackSources(sourceRepository: SourceRepository, completed: IntegrationSourceWrite[]): Promise<void> {
    for (const write of completed.reverse()) {
        try {
            if (write.previous) {
                await sourceRepository.updateSource(write.previous);
            } else {
                await sourceRepository.deleteSource(write.source.urn);
            }
        } catch {
            // Best-effort rollback: keep restoring remaining sources.
        }
    }
}
