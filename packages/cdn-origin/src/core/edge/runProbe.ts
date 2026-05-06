import type { OriginProvider } from "../../exports/OriginProvider";
import type { Edge } from "../../interfaces/entities/Edge";
import { probeEdge } from "./probeEdge";

/**
 * Probe a single edge or every edge, persist the result, and return the
 * freshly-updated rows so the UI can display them without an extra
 * round-trip.
 */
export async function runProbe(provider: OriginProvider, id: string | null): Promise<Edge[]> {
    if (!provider.config.probe) {
        throw new Error("probe is not configured on this origin.");
    }
    const edges = id === null
        ? await provider.edgeRepo.list()
        : await loadOne(provider, id);

    await Promise.all(edges.map(async (e) => {
        const result = await probeEdge(e, { sshKeyPath: provider.config.probe!.sshKeyPath });
        await provider.edgeRepo.recordProbe(e.id, result);
    }));

    return id === null
        ? await provider.edgeRepo.list()
        : await loadOne(provider, id);
}

async function loadOne(provider: OriginProvider, id: string): Promise<Edge[]> {
    const e = await provider.edgeRepo.get(id);
    if (!e) throw new Error(`Edge "${id}" not found.`);
    return [e];
}
