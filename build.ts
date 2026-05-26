// Workspace build orchestrator. Runs in this order so downstream packages
// see the upstream artifacts they need at build time:
//   1. webcomponents `bun run build` → generates dist/{ui.js, style.css,
//      index.d.ts, blocs/*.d.ts, ...}. Must run first because @bernouy/webcomponents
//      resolves its `types` to `./dist/index.d.ts`, and packages that depend on it
//      (cms, cms-blocs) need those d.ts present before tsc --build type-checks them.
//   2. tsc --build  → emits .d.ts for every package (project references).
//   3. cms `bun run build` → runs prebuildControl (control-components.js
//      bundle, depends on webcomponents/dist) + emits its own d.ts.
//
// Other packages (core, runner-bun, auth-*, mailer-*) ship sources
// directly via their `exports` field — no bundle step needed.

async function run(cmd: string[], cwd?: string): Promise<void> {
    const proc = Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit", cwd });
    const exit = await proc.exited;
    if (exit !== 0) throw new Error(`${cmd.join(" ")} (cwd=${cwd ?? "."}) exited with ${exit}`);
}

await run(["bun", "run", "build"], "packages/webcomponents");
await run(["bunx", "tsc", "--build"]);
await run(["bun", "run", "build"], "packages/cms");
// hub-ui bundles its own custom elements (src/components → src/assets/
// hub-components.js IIFE), served by mountHubUi at runtime.
await run(["bun", "run", "build"], "packages/hub-ui");

console.log("✅ workspace build done");
