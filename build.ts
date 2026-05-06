// Workspace build orchestrator. Runs in this order so downstream packages
// see the upstream artifacts they need at build time:
//   1. tsc --build  → emits .d.ts for every package (project references).
//   2. webcomponents `bun run build` → generates dist/{ui.js, style.css, ...}
//      consumed at runtime by `import "@bernouy/webcomponents"`.
//   3. cms `bun run build` → runs prebuildControl (control-components.js
//      bundle, depends on webcomponents/dist) + emits its own d.ts.
//
// Other packages (core, runner-bun, auth-*, mailer-*, cdn-buckets, cdn-node) ship sources
// directly via their `exports` field — no bundle step needed.

async function run(cmd: string[], cwd?: string): Promise<void> {
    const proc = Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit", cwd });
    const exit = await proc.exited;
    if (exit !== 0) throw new Error(`${cmd.join(" ")} (cwd=${cwd ?? "."}) exited with ${exit}`);
}

await run(["bunx", "tsc", "--build"]);
await run(["bun", "run", "build"], "packages/webcomponents");
await run(["bun", "run", "build"], "packages/cms");

console.log("✅ workspace build done");
