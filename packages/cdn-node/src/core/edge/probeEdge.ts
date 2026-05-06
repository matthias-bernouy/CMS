import type { Edge } from "../../interfaces/entities/Edge";
import type { EdgeProbeResult } from "../../interfaces/repositories/EdgeRepository";
import { probeEdgeSsh }  from "./probeEdgeSsh";
import { probeEdgeHttp } from "./probeEdgeHttp";

export type ProbeContext = {
    /** Path of the SSH key used to reach edges (same one used by lsyncd). */
    sshKeyPath: string;
    /** Hard ceiling for each probe; SSH `ConnectTimeout` is set inside this. */
    timeoutMs?: number;
};

/**
 * Probe an edge in two stages — SSH (data integrity) and HTTPS (live
 * serving). Both run in parallel; their outcomes are folded into a
 * single `EdgeProbeResult`. Never throws.
 */
export async function probeEdge(edge: Edge, ctx: ProbeContext): Promise<EdgeProbeResult> {
    const [ssh, http] = await Promise.all([
        probeEdgeSsh(edge, ctx),
        probeEdgeHttp(edge, ctx),
    ]);
    return {
        ok:         ssh.ok,
        error:      ssh.error,
        usedBytes:  ssh.usedBytes,
        fileCount:  ssh.fileCount,
        httpOk:     http.ok,
        httpStatus: http.status,
        httpError:  http.error,
    };
}
