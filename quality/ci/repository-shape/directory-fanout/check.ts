export {
    collectDirectoryEntries,
    findDirectoryFanoutFindings,
    hasBlockingDirectoryFanoutFindings,
    MAX_DIRECTORY_ENTRIES,
    TARGET_DIRECTORY_ENTRIES,
} from "./policy";
export { collectScopedDirectoryEntries, findDirectoryFanoutScopeRoots, QUALITY_SCOPE_ROOT } from "./scope";
export { loadCurrentDirectoryEntries, runDirectoryFanoutCheck } from "./runner";

import { REPOSITORY_ROOT } from "../files";
import { hasBlockingDirectoryFanoutFindings } from "./policy";
import { runDirectoryFanoutCheck } from "./runner";

export async function runDirectoryFanoutCommand(
    repositoryRoot = REPOSITORY_ROOT,
    report: (message: string) => void = (message) => console.log(message),
): Promise<number> {
    const findings = await runDirectoryFanoutCheck(repositoryRoot, report);
    return hasBlockingDirectoryFanoutFindings(findings) ? 1 : 0;
}

if (import.meta.main) {
    process.exitCode = await runDirectoryFanoutCommand();
}
