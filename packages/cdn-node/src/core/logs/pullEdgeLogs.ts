import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { Edge } from "../../interfaces/entities/Edge";

export type LogPullConfig = {
    /** SSH key used to reach the edges (same one as lsyncd + probe). */
    sshKeyPath: string;
    /** Where to drop pulled archives on the origin, one subdir per edge. */
    localDir:   string;
    /** Path on each edge under which the JSON-Lines access log + rotated
     *  archives live. */
    remotePath: string;
};

export type LogPullResult = {
    edgeId:        string;
    ok:            boolean;
    error:         string | null;
    /** Best-effort byte count printed by rsync (`Total bytes received: N`). */
    bytesReceived: number | null;
};

/**
 * SSH-rsync the edge's rotated access-log archives to the origin's local
 * dir. Only `*.gz` files are pulled — the live `access.log` is skipped
 * (it's still being written, partial reads pollute the analytics) and
 * gets included once logrotate has gzipped it.
 *
 * Rsync is incremental: an archive already on the origin (matching size
 * + mtime) is skipped, so the whole loop is idempotent and cheap to run
 * frequently.
 */
export async function pullEdgeLogs(edge: Edge, config: LogPullConfig): Promise<LogPullResult> {
    const localDir = join(config.localDir, edge.id);
    await mkdir(localDir, { recursive: true });

    const sshOpts = [
        "-i", config.sshKeyPath,
        "-p", String(edge.sshPort),
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=10",
    ];

    const cmd = [
        "rsync",
        "-a", "--stats",
        "--include=*.gz",
        "--exclude=*",
        "-e", `ssh ${sshOpts.join(" ")}`,
        `${edge.sshUser}@${edge.hostname}:${config.remotePath}/`,
        `${localDir}/`,
    ];

    try {
        const proc = Bun.spawn({ cmd, stdout: "pipe", stderr: "pipe" });
        const [stdout, stderr] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
        ]);
        const exit = await proc.exited;
        if (exit !== 0) {
            return {
                edgeId:        edge.id,
                ok:            false,
                error:         (stderr || stdout || `rsync exited with ${exit}`).trim().slice(0, 240),
                bytesReceived: null,
            };
        }
        const m = stdout.match(/Total bytes received:\s*([\d,]+)/);
        const bytesReceived = m ? Number(m[1]!.replace(/,/g, "")) : null;
        return { edgeId: edge.id, ok: true, error: null, bytesReceived };
    } catch (err) {
        return {
            edgeId:        edge.id,
            ok:            false,
            error:         err instanceof Error ? err.message : String(err),
            bytesReceived: null,
        };
    }
}

/**
 * Pull from every registered edge in parallel, return per-edge outcomes.
 */
export async function pullAllEdgeLogs(
    edges: ReadonlyArray<Edge>,
    config: LogPullConfig,
): Promise<LogPullResult[]> {
    return Promise.all(edges.map((e) => pullEdgeLogs(e, config)));
}
