import type {
    ClusterJournalDirectory,
    ClusterJournalReader,
    ClusterSource,
} from "observability/cluster/interfaces/ClusterJournal";
import { ClusterLogsError, ClusterSourceError } from "./errors";

export function selectedInstances(ids: readonly string[]): readonly string[] {
    if (
        !Array.isArray(ids) ||
        ids.length < 1 ||
        ids.length > 16 ||
        ids.some((id) => !/^instance:[A-Za-z0-9-]{1,100}$/u.test(id)) ||
        new Set(ids).size !== ids.length
    ) {
        throw new ClusterLogsError("INVALID_INPUT");
    }
    return [...ids].sort();
}
export async function readSources<T>(
    directory: ClusterJournalDirectory,
    ids: readonly string[],
    read: (reader: ClusterJournalReader, instanceId: string) => Promise<T>,
    excluded: readonly ClusterSource[] = [],
) {
    const sources: ClusterSource[] = [];
    const values: T[] = [];
    // Bound concurrent database work independently of the number of selected tenants.
    for (let start = 0; start < ids.length; start += 4) {
        const results = await Promise.all(
            ids.slice(start, start + 4).map(async (instanceId) => {
                const previous = excluded.find((source) => source.instanceId === instanceId);
                if (previous) {
                    return { source: previous };
                }
                try {
                    const value = await read(await directory.open(instanceId), instanceId);
                    return { source: { instanceId, status: "available" as const }, value };
                } catch (error) {
                    return {
                        source: {
                            instanceId,
                            status: error instanceof ClusterSourceError ? error.status : ("unavailable" as const),
                        },
                    };
                }
            }),
        );
        for (const result of results) {
            sources.push(result.source);
            if (result.value !== undefined) {
                values.push(result.value);
            }
        }
    }
    return { sources, values, partial: sources.some((source) => source.status !== "available") };
}
