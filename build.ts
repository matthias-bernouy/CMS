// Workspace build orchestrator. TypeScript project references emit package
// declarations first; cms-content then bundles its browser runtimes.
//
// Other packages ship sources directly via their `exports` field; no bundle
// step is needed.

async function run(cmd: string[], cwd?: string): Promise<void> {
    const proc = Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit", cwd });
    const exit = await proc.exited;
    if (exit !== 0) {
        throw new Error(`${cmd.join(" ")} (cwd=${cwd ?? "."}) exited with ${exit}`);
    }
}

await run(["bunx", "tsc", "--build"]);
await run(["bun", "run", "build:browser"], "packages/features/cms-content");

console.log("✅ workspace build done");
