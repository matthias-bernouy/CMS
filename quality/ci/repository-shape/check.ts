import { hasBlockingDirectoryFanoutFindings } from "./directory-fanout/policy";
import { runDirectoryFanoutCheck } from "./directory-fanout/runner";
import { REPOSITORY_ROOT } from "./files";
import { runFileSizeCheck } from "./file-size/runner";

export async function runRepositoryShapeCheck(
    repositoryRoot = REPOSITORY_ROOT,
    report: (message: string) => void = (message) => console.log(message),
): Promise<number> {
    await runFileSizeCheck(repositoryRoot, report);
    const directoryFindings = await runDirectoryFanoutCheck(repositoryRoot, report);
    return hasBlockingDirectoryFanoutFindings(directoryFindings) ? 1 : 0;
}

if (import.meta.main) {
    process.exitCode = await runRepositoryShapeCheck();
}
