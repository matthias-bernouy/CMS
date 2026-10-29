import { resolve } from "node:path";
import type { CheckDefinition, CheckExecution, CheckExecutor, CheckResult } from "./types";
export const REPOSITORY_ROOT = resolve(import.meta.dir, "../../..");
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
