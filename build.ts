// Workspace build orchestrator. Runs in this order so downstream packages
// see the upstream artifacts they need at build time:
//   1. cms-blocs `bun run build` → generates dist/{ui.js, style.css,
//      index.d.ts, blocs/*.d.ts, ...}. Must run first because @bernouy/cms-blocs
//      resolves its `types` to `./dist/index.d.ts`, and packages that depend on it
//      (cms-control) need those d.ts present before tsc --build
//      type-checks them.
//   2. tsc --build  → emits .d.ts for every package (project references).
//   3. cms-control `bun run build` → runs prebuildControl (control-components.js
//      bundle, depends on cms-blocs/dist) + emits its own d.ts.
//
// Other packages (core, runner-bun, auth-core, cms-shared, cms-delivery,
// cms-gateway, cms-cli) ship sources directly via their `exports` field — no
// bundle step needed.

async function run(cmd: string[], cwd?: string): Promise<void> {
    const proc = Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit", cwd });
    const exit = await proc.exited;
    if (exit !== 0) throw new Error(`${cmd.join(" ")} (cwd=${cwd ?? "."}) exited with ${exit}`);
}

await run(["bun", "run", "build"], "packages/features/cms-blocs");
await run(["bunx", "tsc", "--build"]);
await run(["bun", "run", "build"], "packages/surfaces/cms-control");

console.log("✅ workspace build done");
