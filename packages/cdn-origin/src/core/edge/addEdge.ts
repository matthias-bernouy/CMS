import type { OriginProvider } from "../../exports/OriginProvider";
import type { Edge } from "../../interfaces/entities/Edge";
import type { EdgeCreateDto } from "../validation/parseEdgeCreateDto";
import { regenerateAndReloadLsyncd } from "../lsyncd/reload";

/**
 * Persist a new edge row, regenerate the lsyncd config, and trigger a
 * reload. Once lsyncd respawns it does a full rsync against every target,
 * so the new edge gets bootstrapped automatically.
 *
 * SSH connectivity is NOT tested here — operator setup (key copy,
 * firewall open, user create) is documented in EDGE-SETUP.md. A failed
 * first rsync surfaces in `lsyncd.log` and in the next probe.
 */
export async function addEdge(
    provider: OriginProvider,
    dto: EdgeCreateDto,
): Promise<Edge> {
    const existing = await provider.edgeRepo.get(dto.id);
    if (existing) throw new Error(`Edge "${dto.id}" already exists.`);

    const edge: Edge = {
        id:                 dto.id,
        label:              dto.label ?? dto.id,
        hostname:           dto.hostname,
        sshUser:            dto.sshUser,
        sshPort:            dto.sshPort,
        dataPath:           dto.dataPath,
        notes:              dto.notes,
        addedAt:            Date.now(),
        lastSeenAt:         null,
        lastProbeAt:        null,
        lastProbeOk:        null,
        lastProbeError:     null,
        lastProbeUsedBytes: null,
        lastProbeFileCount: null,
    };

    await provider.edgeRepo.create(edge);

    const edges = await provider.edgeRepo.list();
    if (provider.config.lsyncd) {
        await regenerateAndReloadLsyncd(provider.config.lsyncd, edges);
    }

    return edge;
}
