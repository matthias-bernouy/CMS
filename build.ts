// Workspace and versioned distribution builds. TypeScript references emit
// package declarations first; Content then bundles its browser runtimes.
//
// Other packages ship sources directly via their `exports` field; no bundle
// step is needed.

const version = releaseVersion(Bun.argv.slice(2));

async function run(cmd: string[], cwd?: string): Promise<void> {
    const proc = Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit", cwd });
    const exit = await proc.exited;
    if (exit !== 0) {
        throw new Error(`${cmd.join(" ")} (cwd=${cwd ?? "."}) exited with ${exit}`);
    }
}

await run(["bunx", "tsc", "--build"]);
await run(["bun", "run", "build:browser"], "packages/features/content");
await run(["bun", "run", "generate:official-bootstrap"]);

if (version) {
    await run(["bun", "run", "images:build", "--version", version]);
    await run(["bun", "run", "cli:build", "--version", version, "--stack-version", version]);
    console.log(`✅ Ulvia ${version} build done (Edge, Provider, CLI)`);
} else {
    console.log("✅ workspace build done");
}

function releaseVersion(args: readonly string[]): string | undefined {
    if (args.length === 0) {
        return undefined;
    }
    const version = args[1];
    if (
        args.length !== 2 ||
        args[0] !== "--version" ||
        !version ||
        !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u.test(version)
    ) {
        throw new Error("Usage: bun run build [--version <version>]");
    }
    return version;
}
