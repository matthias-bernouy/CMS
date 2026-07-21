// Workspace build orchestrator. Runs in this order so downstream packages
// see the upstream artifacts they need at build time:
//   1. @bernouy/components `bun run build` generates dist/{index.js,
//      style.css, index.d.ts, blocs/*.mjs, blocs/*.d.ts, ...}. Must run first
//      because cms-control consumes those generated artifacts.
//   2. tsc --build emits .d.ts for every package (project references).
//   3. cms-control `bun run build` runs prebuildControl (control-components.js
//      bundle, depends on @bernouy/components/dist) + emits its own d.ts.
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

await run(["bun", "run", "build"], "packages/foundation/components");
await run(["bunx", "tsc", "--build"]);
await run(["bun", "run", "build"], "packages/surfaces/cms-control");

console.log("✅ workspace build done");
