import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ALL_CHECKS } from "./definitions";
import { changedFiles, parseOptions } from "./changes";
import { formatCheckResults, formatSummaryReport } from "./report";
import { createCheckExecutor, REPOSITORY_ROOT, runChecks } from "./runner";
import type { CheckDefinition, CheckExecutor, ReportOptions } from "./types";
export { ALL_CHECKS } from "./definitions";
export { formatCheckResults } from "./report";
export { runChecks } from "./runner";
export type { CheckDefinition, CheckExecution } from "./types";

export async function runAllChecks(
    checks: readonly CheckDefinition[] = ALL_CHECKS,
    execute: CheckExecutor = createCheckExecutor(),
    report: (output: string) => void = (output) => console.log(output),
): Promise<number> {
    const results = await runChecks(checks, execute);
    report(formatCheckResults(results));
    return results.some(({ exitCode }) => exitCode !== 0) ? 1 : 0;
}

export async function runCheckCli(
    root = REPOSITORY_ROOT,
    args = Bun.argv.slice(2),
    execute = createCheckExecutor(root),
    report = console.log,
): Promise<number> {
    const options = parseOptions(args);
    let paths: string[] = [];
    let failure: string | undefined;
    try {
        paths = await changedFiles(root, options.base);
    } catch (error) {
        failure = String(error);
    }
    const results = await runChecks(ALL_CHECKS, execute);
    if (failure) {
        results.push({
            id: "changed-files",
            label: "Changed-file detection",
            args: [],
            exitCode: 1,
            stdout: "",
            stderr: failure,
        });
    }
    const reportOptions: ReportOptions = { changedPaths: paths, verbose: options.verbose };
    const directory = join(root, "artifacts/check-all");
    // Report persistence is part of success: failed writes must propagate to the caller.
    try {
        await mkdir(directory, { recursive: true });
        await Promise.all([
            writeFile(join(directory, "latest.txt"), formatCheckResults(results)),
            writeFile(
                join(directory, "latest.json"),
                JSON.stringify({ options, changedPaths: paths, results }, null, 2),
            ),
        ]);
    } finally {
        report(formatSummaryReport(results, reportOptions));
    }
    return results.some(({ exitCode }) => exitCode !== 0) ? 1 : 0;
}
if (import.meta.main) {
    process.exitCode = await runCheckCli();
}
