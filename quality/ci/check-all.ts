import { resolve } from "node:path";

export type CheckDefinition = {
    id: string;
    label: string;
    args: string[];
};

export type CheckExecution = {
    exitCode: number;
    stdout: string;
    stderr: string;
};

export type CheckResult = CheckDefinition & CheckExecution;
export type CheckExecutor = (check: CheckDefinition) => Promise<CheckExecution>;

export const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
export const ALL_CHECKS: CheckDefinition[] = [
    { id: "architecture", label: "Workspace architecture", args: ["run", "check:architecture"] },
    {
        id: "integration-ownership",
        label: "Integration ownership",
        args: ["run", "quality/integration-ownership/check.ts"],
    },
    { id: "repository-shape", label: "Repository shape guidance", args: ["run", "check:repository-shape"] },
    { id: "style", label: "Code style", args: ["run", "check:style"] },
    { id: "typecheck", label: "Workspace typecheck", args: ["run", "typecheck"] },
    {
        id: "architecture-tooling",
        label: "Architecture tooling typecheck",
        args: ["x", "tsc", "--project", "quality/architecture/tsconfig.json"],
    },
    {
        id: "ci-tooling",
        label: "CI tooling typecheck",
        args: ["x", "tsc", "--project", "quality/ci/tsconfig.json"],
    },
];

export function createCheckExecutor(repositoryRoot = REPOSITORY_ROOT): CheckExecutor {
    return async ({ args }) => {
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
        return { exitCode, stdout, stderr };
    };
}

export async function runChecks(checks: readonly CheckDefinition[], execute: CheckExecutor): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    for (const check of checks) {
        try {
            results.push({ ...check, ...(await execute(check)) });
        } catch (error) {
            const stderr = error instanceof Error ? error.message : String(error);
            results.push({ ...check, exitCode: 1, stdout: "", stderr });
        }
    }
    return results;
}

export function formatCheckResults(results: readonly CheckResult[]): string {
    const output: string[] = [];
    for (const result of results) {
        const status = result.exitCode === 0 ? "PASS" : "FAIL";
        output.push(`[check:all][${status}] ${result.id} — ${result.label}`);
        output.push(`command: bun ${result.args.join(" ")}`);
        if (result.stdout.trim()) {
            output.push(result.stdout.trimEnd());
        }
        if (result.stderr.trim()) {
            output.push(`[stderr]\n${result.stderr.trimEnd()}`);
        }
    }
    const failed = results.filter(({ exitCode }) => exitCode !== 0).length;
    output.push(`[check:all][SUMMARY] ${results.length - failed} passed, ${failed} failed`);
    return output.join("\n");
}

export async function runAllChecks(
    checks: readonly CheckDefinition[] = ALL_CHECKS,
    execute: CheckExecutor = createCheckExecutor(),
    report: (output: string) => void = (output) => console.log(output),
): Promise<number> {
    const results = await runChecks(checks, execute);
    report(formatCheckResults(results));
    return results.some(({ exitCode }) => exitCode !== 0) ? 1 : 0;
}

if (import.meta.main) {
    process.exitCode = await runAllChecks();
}
