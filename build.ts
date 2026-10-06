// Workspace build orchestrator. TypeScript project references emit package
// declarations first; cms-control then bundles the shared cms-content browser
// runtime into its presentation-free host asset.
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
await run(["bun", "run", "build"], "packages/surfaces/cms-control");

console.log("✅ workspace build done");
