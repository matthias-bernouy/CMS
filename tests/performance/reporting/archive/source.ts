import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { sourceProvenance } from "../../harness/measurements/provenance";
import { responseBytes } from "../../harness/transport/http";
import { realDirectory } from "../storage/io";

export type SourceIdentity = Awaited<ReturnType<typeof sourceProvenance>>;
export type SourceSnapshot = Readonly<{
    path: string;
    sourceDigest: string;
    revision: string;
    files: number;
    bytes: number;
    archiveSha256: string;
    manifestSha256: string;
}>;

async function python(script: string, args: readonly string[], input?: SourceIdentity): Promise<SourceSnapshot> {
    const child = Bun.spawn(["python3", "-B", resolve(import.meta.dir, script), ...args], {
        stdin: input ? "pipe" : "ignore",
        stdout: "pipe",
        stderr: "pipe",
        timeout: 120_000,
    });
    try {
        if (input && child.stdin) {
            child.stdin.write(JSON.stringify(input));
            child.stdin.end();
        }
        const [code, output] = await Promise.all([
            child.exited,
            responseBytes(new Response(child.stdout), 64 * 1024),
            responseBytes(new Response(child.stderr), 64 * 1024),
        ]);
        if (code !== 0) {
            throw new Error("Source archive capture or integrity verification failed");
        }
        const value = JSON.parse(new TextDecoder().decode(output));
        if (
            !/^[a-f0-9]{64}$/u.test(value.sourceDigest) ||
            !/^[a-f0-9]{40}$/u.test(value.revision) ||
            !/^[a-f0-9]{64}$/u.test(value.archiveSha256) ||
            !/^[a-f0-9]{64}$/u.test(value.manifestSha256) ||
            typeof value.path !== "string" ||
            !Number.isSafeInteger(value.files) ||
            value.files < 1 ||
            value.files > 10000 ||
            !Number.isSafeInteger(value.bytes) ||
            value.bytes < 0 ||
            value.bytes > 256 * 1024 ** 2
        ) {
            throw new Error("Invalid source archive receipt");
        }
        return value;
    } finally {
        child.kill("SIGKILL");
        await child.exited;
    }
}

/** Verification checks every source member as well as the archive, patch and manifest seals. */
export async function verifySourceSnapshot(directory: string): Promise<SourceSnapshot> {
    await realDirectory(directory);
    return python("snapshot.py", [resolve(directory)]);
}

/** Stable source identity is captured before listeners or measured processes exist; existing snapshots are verified. */
export async function captureSourceSnapshot(
    root = resolve(import.meta.dir, "../../../.."),
    destination = join(root, "artifacts/performance/source-snapshots"),
    expected?: SourceIdentity,
): Promise<SourceSnapshot> {
    await realDirectory(root);
    await mkdir(destination, { recursive: true, mode: 0o700 });
    await realDirectory(destination);
    const identity = expected ?? (await sourceProvenance(root));
    const snapshot = await python("capture.py", [resolve(root), resolve(destination)], identity);
    if (snapshot.sourceDigest !== identity.sourceDigest || snapshot.revision !== identity.revision) {
        throw new Error("Source snapshot differs from the requested candidate");
    }
    return snapshot;
}

if (import.meta.main) {
    const [command, root, destination] = Bun.argv.slice(2);
    const result =
        command === "verify" && root
            ? await verifySourceSnapshot(root)
            : command === "capture"
              ? await captureSourceSnapshot(root, destination)
              : undefined;
    if (!result) {
        throw new Error("Use source.ts capture [workspace] [destination] or source.ts verify <snapshot>");
    }
    console.log(JSON.stringify(result));
}
