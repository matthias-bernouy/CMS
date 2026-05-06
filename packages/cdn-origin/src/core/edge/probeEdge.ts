import type { Edge } from "../../interfaces/entities/Edge";
import type { EdgeProbeResult } from "../../interfaces/repositories/EdgeRepository";

export type ProbeContext = {
    /** Path of the SSH key used to reach edges (same one used by lsyncd). */
    sshKeyPath: string;
    /** Hard ceiling for the probe; SSH `ConnectTimeout` is set inside this. */
    timeoutMs?: number;
};

/**
 * Probe an edge via SSH:
 *   1. open an SSH session,
 *   2. run a tiny shell snippet that prints `<bytes>\t<file count>`
 *      computed from `edge.dataPath`,
 *   3. parse the output.
 *
 * Returns a structured `EdgeProbeResult` — never throws. The shell
 * snippet uses `du -sb` (sum of file sizes in bytes, GNU du) and `find …
 * -type f | wc -l`. On non-GNU systems (BSD), `du -sk` would be needed
 * instead — left as a future-compat note.
 */
export async function probeEdge(edge: Edge, ctx: ProbeContext): Promise<EdgeProbeResult> {
    const timeoutMs = ctx.timeoutMs ?? 15_000;

    const remoteCmd = [
        `if [ ! -d "${shellQuote(edge.dataPath)}" ]; then`,
        `    echo "missing_data_path" 1>&2; exit 2;`,
        `fi;`,
        `bytes=$(du -sb "${shellQuote(edge.dataPath)}" 2>/dev/null | awk '{print $1}');`,
        `files=$(find "${shellQuote(edge.dataPath)}" -type f 2>/dev/null | wc -l);`,
        `printf "%s\\t%s\\n" "$bytes" "$files";`,
    ].join(" ");

    const sshArgs = [
        "ssh",
        "-i", ctx.sshKeyPath,
        "-p", String(edge.sshPort),
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "BatchMode=yes",
        "-o", `ConnectTimeout=${Math.max(2, Math.floor(timeoutMs / 1000) - 2)}`,
        "-o", "ServerAliveInterval=5",
        `${edge.sshUser}@${edge.hostname}`,
        "--",
        "bash", "-c", remoteCmd,
    ];

    try {
        const proc = Bun.spawn({
            cmd:    sshArgs,
            stdout: "pipe",
            stderr: "pipe",
        });

        const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
        const [stdout, stderr] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
        ]);
        const code = await proc.exited;
        clearTimeout(timer);

        if (code !== 0) {
            const msg = (stderr || stdout || `ssh exited with ${code}`).trim().slice(0, 240);
            return { ok: false, error: msg, usedBytes: null, fileCount: null };
        }

        const line = stdout.trim().split(/\r?\n/).pop() ?? "";
        const [bytesRaw, filesRaw] = line.split("\t");
        const usedBytes = Number(bytesRaw);
        const fileCount = Number(filesRaw);
        if (!Number.isFinite(usedBytes) || !Number.isFinite(fileCount)) {
            return { ok: false, error: `unparseable probe output: ${line.slice(0, 80)}`, usedBytes: null, fileCount: null };
        }
        return { ok: true, error: null, usedBytes, fileCount };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err), usedBytes: null, fileCount: null };
    }
}

function shellQuote(s: string): string {
    // Escape double-quotes for safe inclusion inside the `bash -c "…"` string.
    return s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
