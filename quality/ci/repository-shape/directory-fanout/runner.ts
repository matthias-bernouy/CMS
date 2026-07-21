import { listCurrentRepositoryPaths, REPOSITORY_ROOT } from "../files";
import {
    collectDirectoryEntries,
    findDirectoryFanoutFindings,
    TARGET_DIRECTORY_ENTRIES,
    WIDE_DIRECTORY_ENTRIES,
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
        const guidance = severity === "warning"
            ? `above the ${WIDE_DIRECTORY_ENTRIES}-entry review threshold`
            : `above the ${TARGET_DIRECTORY_ENTRIES}-entry target`;
        report(`[directory-fanout][${label}] ${path}: ${currentEntries} entries (${guidance})`);
    }
    const infoCount = findings.filter(({ severity }) => severity === "info").length;
    const warningCount = findings.length - infoCount;
    report(
        `Directory-fanout guidance: ${infoCount} info, ${warningCount} warnings. Findings are advisory.`,
    );
    return findings;
}
