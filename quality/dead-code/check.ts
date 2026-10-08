import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

type CommandResult = {
    readonly exitCode: number;
    readonly output: string;
};

const repositoryRoot = resolve(import.meta.dir, "../..");
const packageConfigGlob = new Bun.Glob("packages/*/*/tsconfig.json");
const packageConfigs = [...packageConfigGlob.scanSync({ cwd: repositoryRoot, absolute: true })].sort();

async function run(args: readonly string[]): Promise<CommandResult> {
    const child = Bun.spawn([process.execPath, ...args], {
        cwd: repositoryRoot,
        env: { ...process.env, NO_COLOR: "1" },
        stdout: "pipe",
        stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
    ]);
    return { exitCode, output: [stdout.trimEnd(), stderr.trimEnd()].filter(Boolean).join("\n") };
}

async function unusedTypeScriptDeclarations(): Promise<CommandResult> {
    const findings: string[] = [];
    let failed = false;
    for (const [index, config] of packageConfigs.entries()) {
        const buildInfo = join(tmpdir(), `cmscore-dead-code-${index}-${basename(resolve(config, ".."))}.tsbuildinfo`);
        const result = await run([
            "x",
            "tsc",
            "--project",
            config,
            "--noEmit",
            "--noUnusedLocals",
            "--noUnusedParameters",
            "--tsBuildInfoFile",
            buildInfo,
            "--pretty",
            "false",
        ]);
        if (result.exitCode !== 0) {
            failed = true;
            findings.push(`[dead-code][typescript] ${relative(repositoryRoot, config)}`, result.output);
        }
    }
    return { exitCode: failed ? 1 : 0, output: findings.join("\n") };
}

async function unusedFilesExportsAndDependencies(): Promise<CommandResult> {
    const workspaces = packageConfigs.flatMap((config) => [
        "--workspace",
        relative(repositoryRoot, resolve(config, "..")),
    ]);
    console.log("[dead-code][knip]");
    const child = Bun.spawn(
        [
            process.execPath,
            resolve(repositoryRoot, "node_modules/knip/bin/knip-bun.js"),
            "--config",
            "knip.json",
            ...workspaces,
            "--no-progress",
            "--reporter",
            "compact",
        ],
        {
            cwd: repositoryRoot,
            env: { ...process.env, NO_COLOR: "1" },
            stdout: "inherit",
            stderr: "inherit",
        },
    );
    return {
        exitCode: await child.exited,
        output: "",
    };
}

const results = [await unusedFilesExportsAndDependencies(), await unusedTypeScriptDeclarations()];
for (const output of results.map(({ output }) => output).filter(Boolean)) {
    console.log(output);
}
const failed = results.filter(({ exitCode }) => exitCode !== 0).length;
console.log(`[dead-code][SUMMARY] ${failed ? "findings detected" : "no findings"}`);
process.exitCode = failed ? 1 : 0;
