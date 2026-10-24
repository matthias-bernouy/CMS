import { readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const PACKAGE_LAYERS = ["foundation", "features", "surfaces", "runtimes"] as const;

export async function cleanWorkspaceBuildOutputs(repositoryRoot: string): Promise<string[]> {
    const packagesRoot = resolve(repositoryRoot, "packages");
    const removed: string[] = [];
    for (const layer of PACKAGE_LAYERS) {
        const layerRoot = join(packagesRoot, layer);
        const entries = await readdir(layerRoot, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }
            const packageRoot = join(layerRoot, entry.name);
            if (!(await Bun.file(join(packageRoot, "package.json")).exists())) {
                continue;
            }
            for (const relativePath of ["dist", "tsconfig.tsbuildinfo"] as const) {
                const target = join(packageRoot, relativePath);
                await rm(target, { recursive: true, force: true });
                removed.push(target);
            }
        }
    }
    return removed;
}

async function runClean(): Promise<void> {
    const repositoryRoot = resolve(import.meta.dir, "../..");
    const typeScriptClean = Bun.spawn([process.execPath, "x", "tsc", "--build", "--clean"], {
        cwd: repositoryRoot,
        stdout: "inherit",
        stderr: "inherit",
    });
    const exitCode = await typeScriptClean.exited;
    if (exitCode !== 0) {
        throw new Error(`TypeScript clean failed with exit code ${exitCode}`);
    }
    const removed = await cleanWorkspaceBuildOutputs(repositoryRoot);
    console.log(`Removed build outputs from ${removed.length / 2} workspace packages.`);
}

if (import.meta.main) {
    await runClean();
}
