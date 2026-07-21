import { listCurrentRepositoryPaths, REPOSITORY_ROOT } from "../files";
import {
    collectDirectoryEntries,
    findDirectoryFanoutFindings,
    MAX_DIRECTORY_ENTRIES,
    TARGET_DIRECTORY_ENTRIES,
} from "./policy";

export async function loadCurrentDirectoryEntries(repositoryRoot = REPOSITORY_ROOT) {
    return collectDirectoryEntries(await listCurrentRepositoryPaths(repositoryRoot));
}

export async function runDirectoryFanoutCheck(
    repositoryRoot = REPOSITORY_ROOT,
    report: (message: string) => void = (message) => console.log(message),
) {
    const current = await loadCurrentDirectoryEntries(repositoryRoot);
    const findings = findDirectoryFanoutFindings(current);
    for (const { path, currentEntries, severity } of findings) {
        const label = severity.toUpperCase();
        const guidance =
            severity === "error"
                ? `above the ${MAX_DIRECTORY_ENTRIES}-entry maximum`
                : `above the ${TARGET_DIRECTORY_ENTRIES}-entry target`;
        report(`[directory-fanout][${label}] ${path}: ${currentEntries} entries (${guidance})`);
    }
    const infoCount = findings.filter(({ severity }) => severity === "info").length;
    const errorCount = findings.length - infoCount;
    report(`Directory-fanout policy: ${infoCount} info, ${errorCount} errors. Errors are blocking.`);
    return findings;
}
