import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { docker } from "../../../integration/instance/docker";
import { PROBE_FILE, traceFile } from "../instrumentation/records";

export type ProbeRow = Readonly<Record<string, unknown>>;

export async function buildProbe() {
    const root = await mkdtemp(join(tmpdir(), "ulvia-performance-probe-"));
    try {
        const output = await Bun.build({
            entrypoints: [resolve(import.meta.dir, "../instrumentation/preload.ts")],
            target: "bun",
        });
        if (!output.success || output.outputs.length !== 1) {
            throw new Error(`Cannot compile performance instrumentation: ${output.logs.join("\n")}`);
        }
        const bytes = await output.outputs[0]!.arrayBuffer();
        const path = join(root, "probe.ts");
        await writeFile(path, new Uint8Array(bytes), { mode: 0o644 });
        return {
            path,
            digest: createHash("sha256").update(new Uint8Array(bytes)).digest("hex"),
            close: () => rm(root, { force: true, recursive: true }),
        };
    } catch (error) {
        await rm(root, { force: true, recursive: true });
        throw error;
    }
}

export function parseProbe(text: string): ProbeRow[] {
    if (Buffer.byteLength(text) > 16 * 1024 * 1024) {
        throw new Error("Performance probe output exceeds its collection bound");
    }
    return text
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            const row = JSON.parse(line);
            if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.kind !== "string") {
                throw new Error("Invalid performance probe record");
            }
            return row;
        });
}

/** Read only files belonging to this test-owned container. No application logs or request bodies are exported. */
export async function readProbe(container: string, traceId?: string): Promise<ProbeRow[]> {
    const path = traceId ? traceFile(traceId) : PROBE_FILE;
    const script = `const f=Bun.file(${JSON.stringify(path)});if(await f.exists()){if(f.size>16777216)throw Error("Probe overflow");process.stdout.write(await f.text())}`;
    const result = await docker(["exec", container, "bun", "-e", script]);
    return parseProbe(result.stdout);
}

export async function readProbes(container: string, traceIds: readonly string[]): Promise<ProbeRow[]> {
    if (!traceIds.length || traceIds.length > 100) {
        throw new Error("Probe collection requires between one and 100 traces");
    }
    const paths = traceIds.map(traceFile);
    const script = `let size=0;for(const path of ${JSON.stringify(paths)}){const f=Bun.file(path);if(await f.exists()){size+=f.size;if(size>16777216)throw Error("Probe batch overflow");process.stdout.write(await f.text())}}`;
    const result = await docker(["exec", container, "bun", "-e", script]);
    return parseProbe(result.stdout);
}

export async function deleteProbe(container: string, traceId: string): Promise<void> {
    await docker([
        "exec",
        container,
        "bun",
        "-e",
        `await Bun.file(${JSON.stringify(traceFile(traceId))}).delete().catch(e=>{if(e.code!=="ENOENT")throw e})`,
    ]);
}

export async function deleteProbes(container: string, traceIds: readonly string[]): Promise<void> {
    const paths = traceIds.map(traceFile);
    await docker([
        "exec",
        container,
        "bun",
        "-e",
        `for(const path of ${JSON.stringify(paths)}){await Bun.file(path).delete().catch(e=>{if(e.code!=="ENOENT")throw e})}`,
    ]);
}
