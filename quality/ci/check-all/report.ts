import type { CheckResult, ReportOptions } from "./types";
import { reviewBlock } from "./review";
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

export function formatSummaryReport(results: readonly CheckResult[], options: ReportOptions): string {
    const failed = results.filter(({ exitCode }) => exitCode !== 0).length;
    const lines = [`[check:all][SUMMARY] ${results.length - failed} passed, ${failed} failed`];
    for (const result of results) {
        lines.push(`[${result.exitCode === 0 ? "PASS" : "FAIL"}] ${result.id} — ${result.label}`);
    }
    for (const result of results) {
        const output = [result.stdout.trimEnd(), result.stderr.trimEnd()].filter(Boolean).join("\n");
        if (!output) {
            continue;
        }
        if (options.verbose || result.exitCode !== 0) {
            lines.push(`\n${result.id}:`, output);
            continue;
        }
        let hidden = 0;
        let includeDetails = false;
        for (const line of output.split("\n")) {
            const finding = line.match(/^\[[^\]]+\]\[(INFO|WARNING|ERROR)\](?:\[[^\]]+\])* (.+?):(?:\s|\d)/);
            if (!finding) {
                if (includeDetails && /^\s+/.test(line)) {
                    lines.push(line);
                } else {
                    includeDetails = false;
                }
                continue;
            }
            const path = finding[2]!;
            if (
                finding[1] === "ERROR" ||
                options.changedPaths.some((changed) => changed === path || changed.startsWith(`${path}/`))
            ) {
                includeDetails = true;
                lines.push(line);
            } else {
                includeDetails = false;
                hidden++;
            }
        }
        if (hidden) {
            lines.push(`${result.id}: ${hidden} other advisory findings (full report in artifacts).`);
        }
    }
    lines.push(
        "",
        ...(results.some((result) => result.id === "changed-files" && result.exitCode !== 0)
            ? ["Review: changed-file detection failed; review the full affected scope."]
            : reviewBlock(options.changedPaths)),
        "Reports: artifacts/check-all/latest.txt and latest.json",
    );
    return lines.join("\n");
}
