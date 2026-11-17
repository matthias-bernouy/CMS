import { administrationControls, canonicalDigest } from "./model";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { docker } from "../../../integration/instance/docker";
import { administrationBundle, administrationDataset, MOSSA_FIXTURE } from "./bundle";

async function copyFixture(providerName: string, source: string, destination: string) {
    const process = Bun.spawn(
        [
            "docker",
            "exec",
            "--interactive",
            providerName,
            "bun",
            "-e",
            `await Bun.write(${JSON.stringify(destination)}, await Bun.stdin.arrayBuffer())`,
        ],
        {
            stdin: Bun.file(source),
            stdout: "pipe",
            stderr: "pipe",
        },
    );
    const [code, , error] = await Promise.all([
        process.exited,
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
    ]);
    if (code !== 0) {
        throw new Error(`Administration fixture copy failed: ${error.slice(-1000)}`);
    }
}

/** Restore a historical admitted bundle outside timing; every measured read uses the real Registry HTTP stack. */
export async function restoreAdministration(providerName: string) {
    const artifact = await administrationBundle();
    const controls = administrationControls(artifact.release);
    const temporary = await mkdtemp(join(tmpdir(), "ulvia-administration-fixture-"));
    const remote = "/tmp/ulvia-administration-fixture";
    try {
        const build = await Bun.build({
            entrypoints: [resolve(import.meta.dir, "restore-program.ts")],
            target: "bun",
            external: ["@bernouy/*"],
        });
        if (!build.success || build.outputs.length !== 1) {
            throw new Error("Could not build administration fixture restoration");
        }
        const script = join(temporary, "restore.ts");
        await writeFile(script, new Uint8Array(await build.outputs[0]!.arrayBuffer()));
        // Docker archive copy cannot write to tmpfs on a read-only container root; stream through the running process.
        await copyFixture(providerName, MOSSA_FIXTURE, `${remote}.json.gz`);
        await copyFixture(providerName, script, `${remote}.ts`);
        try {
            await docker(["exec", "--workdir", "/app", providerName, "bun", `${remote}.ts`, `${remote}.json.gz`]);
        } catch (error) {
            // This command handles only the public fixture and local paths; it never receives credentials.
            console.log(`Administration fixture restoration failed: ${String(error).slice(0, 3000)}`);
            throw error;
        }
    } finally {
        await docker(["exec", providerName, "rm", "-f", `${remote}.ts`, `${remote}.json.gz`], true);
        await rm(temporary, { recursive: true, force: true });
    }
    const controlDigest = canonicalDigest(canonicalizeIJson(controls));
    return Object.fromEntries([
        ["mossa", administrationDataset(artifact.release, artifact.digest)],
        ...[0, 1, 21].map((count) => [
            `mossa-control-${count}`,
            administrationDataset(controls, controlDigest, `performance-${count}`),
        ]),
    ]);
}
