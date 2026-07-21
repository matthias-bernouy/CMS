import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { listCurrentPaths, renamedSources, REPOSITORY_ROOT } from "../file-size/git";
import { listBaselinePaths, resolveDirectoryFanoutReference } from "./git";
import {
    collectDirectoryEntries,
    findDirectoryFanoutViolations,
    MAX_DIRECTORY_ENTRIES,
    TARGET_DIRECTORY_ENTRIES,
} from "./policy";
import { inferPureDirectoryRenames } from "./renames";

async function pathExists(path: string): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
        throw error;
    }
}

export async function listExistingCurrentPaths(repositoryRoot = REPOSITORY_ROOT): Promise<string[]> {
    const paths = listCurrentPaths(repositoryRoot);
    const existing = await Promise.all(
        paths.map(async (path) => ((await pathExists(resolve(repositoryRoot, path))) ? path : undefined)),
    );
    return existing.filter((path): path is string => path !== undefined);
}

export async function loadCurrentDirectoryEntries(repositoryRoot = REPOSITORY_ROOT) {
    return collectDirectoryEntries(await listExistingCurrentPaths(repositoryRoot));
}

export function loadBaselineDirectoryEntries(reference: string, repositoryRoot = REPOSITORY_ROOT) {
    return collectDirectoryEntries(listBaselinePaths(reference, repositoryRoot));
}

export async function runDirectoryFanoutRatchet(): Promise<void> {
    const requested = process.env.DIRECTORY_FANOUT_BASELINE_REF ?? process.env.REPOSITORY_SHAPE_BASELINE_REF;
    const reference = resolveDirectoryFanoutReference(requested);
    const currentPaths = await listExistingCurrentPaths();
    const current = collectDirectoryEntries(currentPaths);
    const baselinePaths = reference ? listBaselinePaths(reference) : [];
    const baseline = collectDirectoryEntries(baselinePaths);
    const renamedFiles = reference ? renamedSources(reference) : new Map<string, string>();
    const renamedDirectories = inferPureDirectoryRenames(baselinePaths, currentPaths, renamedFiles);
    const violations = findDirectoryFanoutViolations(current, baseline, renamedDirectories);
    if (violations.length > 0) {
        const details = violations.map(({ path, currentEntries, allowedEntries, reason }) => {
            const label = reason === "new_over_limit" ? "new directory" : "legacy growth";
            return `${path}: ${currentEntries} entries, allowed ${allowedEntries} (${label})`;
        });
        const renameHint = violations.some(({ reason }) => reason === "new_over_limit")
            ? "\nStage complete directory moves so Git can preserve their legacy allowance."
            : "";
        throw new Error(`Directory-fanout regressions:\n- ${details.join("\n- ")}${renameHint}`);
    }
    const legacyCount = [...current.values()].filter((entries) => entries.size > MAX_DIRECTORY_ENTRIES).length;
    console.log(
        `Directory-fanout ratchet passed against ${reference ?? "an empty baseline"}: target ${TARGET_DIRECTORY_ENTRIES}, hard cap ${MAX_DIRECTORY_ENTRIES}, ${legacyCount} legacy directories unchanged or reduced.`,
    );
}
