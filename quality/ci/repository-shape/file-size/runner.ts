import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { listCurrentRepositoryPaths, REPOSITORY_ROOT } from "../files";
import {
    countPhysicalLines,
    findFileSizeFindings,
    isGovernedFile,
    LARGE_FILE_LINES,
    TARGET_FILE_LINES,
} from "./policy";

export async function loadCurrentLines(repositoryRoot = REPOSITORY_ROOT): Promise<Map<string, number>> {
    const lines = new Map<string, number>();
    for (const path of await listCurrentRepositoryPaths(repositoryRoot)) {
        if (!isGovernedFile(path)) continue;
        try {
            lines.set(path, countPhysicalLines(await readFile(resolve(repositoryRoot, path), "utf8")));
        } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
            throw error;
        }
    }
    return lines;
}

export async function runFileSizeCheck(
    repositoryRoot = REPOSITORY_ROOT,
    report: (message: string) => void = (message) => console.log(message),
) {
    const current = await loadCurrentLines(repositoryRoot);
    const findings = findFileSizeFindings(current);
    for (const { path, currentLines, severity } of findings) {
        const label = severity.toUpperCase();
        const guidance = severity === "warning"
            ? `above the ${LARGE_FILE_LINES}-line review threshold`
            : `above the ${TARGET_FILE_LINES}-line target`;
        report(`[file-size][${label}] ${path}: ${currentLines} lines (${guidance})`);
    }
    const infoCount = findings.filter(({ severity }) => severity === "info").length;
    const warningCount = findings.length - infoCount;
    report(
        `File-size guidance: ${infoCount} info, ${warningCount} warnings. Findings are advisory.`,
    );
    return findings;
}
