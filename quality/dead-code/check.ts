import { tmpdir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
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
    console.log("[dead-code][knip]");
    const knip = resolve(repositoryRoot, "node_modules/knip/bin/knip-bun.js");
    const shared = ["--no-progress", "--reporter", "compact"];
    const child = Bun.spawn([process.execPath, knip, "--config", "knip.json", ...shared], {
        cwd: repositoryRoot,
        env: { ...process.env, NO_COLOR: "1" },
        stdout: "inherit",
        stderr: "inherit",
    });
    return {
        exitCode: await child.exited,
        output: "",
    };
}

function officialRepositoryUnusedFiles(): CommandResult {
    const root = resolve(repositoryRoot, "packages/official-repository");
    const files = [...new Bun.Glob("**/*.{js,ts}").scanSync({ cwd: root, absolute: true })].sort();
    const known = new Set(files);
    const visited = new Set<string>();
    const pending = files.filter((file) => file.endsWith("/bloc.ts") || /\.(?:test|spec)\.[jt]s$/.test(file));
    const importPattern = /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
    while (pending.length) {
        const file = pending.pop();
        if (!file || visited.has(file)) {
            continue;
        }
        visited.add(file);
        for (const match of readFileSync(file, "utf8").matchAll(importPattern)) {
            const specifier = match[1];
            if (!specifier?.startsWith(".")) {
                continue;
            }
            const base = resolve(file, "..", specifier);
            const imported = [base, `${base}.ts`, `${base}.js`, join(base, "index.ts"), join(base, "index.js")].find(
                existsSync,
            );
            if (imported && known.has(imported)) {
                pending.push(imported);
            }
        }
    }
    const unused = files.filter((file) => !visited.has(file));
    return {
        exitCode: unused.length ? 1 : 0,
        output: unused.map((file) => `[dead-code][official-repository] ${relative(repositoryRoot, file)}`).join("\n"),
    };
}

const results = [
    await unusedFilesExportsAndDependencies(),
    officialRepositoryUnusedFiles(),
    await unusedTypeScriptDeclarations(),
];
for (const output of results.map(({ output }) => output).filter(Boolean)) {
    console.log(output);
}
const failed = results.filter(({ exitCode }) => exitCode !== 0).length;
console.log(`[dead-code][SUMMARY] ${failed ? "findings detected" : "no findings"}`);
process.exitCode = failed ? 1 : 0;
