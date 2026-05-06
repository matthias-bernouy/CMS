import type { Edge } from "../../interfaces/entities/Edge";
import type { ProbeContext } from "./probeEdge";

export type SshProbeResult = {
    ok:        boolean;
    error:     string | null;
    usedBytes: number | null;
    fileCount: number | null;
};

/**
 * SSH-based probe: open a session, compute `du -sb` + `find -type f | wc -l`
 * on `edge.dataPath`, parse the printed line. GNU coreutils only — fine
 * for our cdn-edge image (debian-slim). Never throws.
 */
export async function probeEdgeSsh(edge: Edge, ctx: ProbeContext): Promise<SshProbeResult> {
    const timeoutMs = ctx.timeoutMs ?? 15_000;

    const remoteCmd = [
        `if [ ! -d "${shellQuote(edge.dataPath)}" ]; then`,
        `    echo "missing_data_path" 1>&2; exit 2;`,
        `fi;`,
        `bytes=$(du -sb "${shellQuote(edge.dataPath)}" 2>/dev/null | awk '{print $1}');`,
        `files=$(find "${shellQuote(edge.dataPath)}" -type f 2>/dev/null | wc -l);`,
        `printf "%s\\t%s\\n" "$bytes" "$files";`,
    ].join(" ");

    // SSH concatenates every post-host argv entry with single spaces and
    // hands the result to the remote shell. We can't pass `bash -c
    // <script>` as three separate args because the remote sh will then
    // re-tokenise the script on whitespace. Instead we send the script
    // as a single argument — the remote shell parses it as a normal
    // command string.
    const sshArgs = [
        "ssh",
        "-i", ctx.sshKeyPath,
        "-p", String(edge.sshPort),
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "BatchMode=yes",
        "-o", `ConnectTimeout=${Math.max(2, Math.floor(timeoutMs / 1000) - 2)}`,
        "-o", "ServerAliveInterval=5",
        `${edge.sshUser}@${edge.hostname}`,
        remoteCmd,
    ];

    try {
        const proc = Bun.spawn({ cmd: sshArgs, stdout: "pipe", stderr: "pipe" });
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
    return s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
