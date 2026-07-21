import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { listCurrentPaths, loadBaselineLines, renamedSources, REPOSITORY_ROOT, resolveFileSizeReference } from "./git";
import { countPhysicalLines, findFileSizeViolations, isGovernedFile, MAX_FILE_LINES, TARGET_FILE_LINES } from "./policy";

export async function loadCurrentLines(repositoryRoot = REPOSITORY_ROOT): Promise<Map<string, number>> {
    const lines = new Map<string, number>();
    for (const path of listCurrentPaths(repositoryRoot)) {
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

export async function runFileSizeRatchet(): Promise<void> {
    const requested = process.env.FILE_SIZE_BASELINE_REF ?? process.env.REPOSITORY_SHAPE_BASELINE_REF;
    const reference = resolveFileSizeReference(requested);
    const current = await loadCurrentLines();
    const renames = reference ? renamedSources(reference) : new Map<string, string>();
    const baseline = reference ? loadBaselineLines(reference, current, renames) : new Map<string, number>();
    const violations = findFileSizeViolations(current, baseline, renames);
    if (violations.length > 0) {
        const details = violations.map(({ path, currentLines, allowedLines, reason }) => {
            const label = reason === "new_over_limit" ? "new file" : "legacy growth";
            return `${path}: ${currentLines} lines, allowed ${allowedLines} (${label})`;
        });
        throw new Error(`File-size regressions:\n- ${details.join("\n- ")}`);
    }
    const legacyCount = [...current.values()].filter((lines) => lines > MAX_FILE_LINES).length;
    console.log(
        `File-size ratchet passed against ${reference ?? "an empty baseline"}: target ${TARGET_FILE_LINES}, hard cap ${MAX_FILE_LINES}, ${legacyCount} legacy files unchanged or reduced.`,
    );
}
