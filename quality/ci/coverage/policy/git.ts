import { relative } from "node:path";
import { parseBaseline } from "../measurement/baseline";
import { BASELINE_PATH, normalizePath, REPOSITORY_ROOT } from "../paths";
import type { CoverageBaseline } from "../types";

export function parseRemovedOrRenamedPaths(nameStatus: string): Set<string> {
    const removed = new Set<string>();
    for (const line of nameStatus.split(/\r?\n/)) {
        if (!line) continue;
        const [status, firstPath] = line.split("\t");
        if (firstPath && (status === "D" || status?.startsWith("R"))) removed.add(normalizePath(firstPath));
    }
    return removed;
}

export function parseRenamedSourcesByDestination(nameStatus: string): Map<string, string> {
    const renamed = new Map<string, string>();
    for (const line of nameStatus.split(/\r?\n/)) {
        if (!line) continue;
        const [status, sourcePath, destinationPath] = line.split("\t");
        if (status?.startsWith("R") && sourcePath && destinationPath) {
            renamed.set(normalizePath(destinationPath), normalizePath(sourcePath));
        }
    }
    return renamed;
}

export function isPackageRemovalAllowed(
    packagePath: string,
    removedOrRenamedPaths: ReadonlySet<string>,
): boolean {
    return removedOrRenamedPaths.has(`${normalizePath(packagePath)}/package.json`);
}

export function git(
    args: string[],
    repositoryRoot = REPOSITORY_ROOT,
): { exitCode: number; stdout: string; stderr: string } {
    const result = Bun.spawnSync(["git", ...args], {
        cwd: repositoryRoot,
        stdout: "pipe",
        stderr: "pipe",
    });
    return {
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
    };
}

export function readReferenceBaseline(
    reference: string,
    repositoryRoot = REPOSITORY_ROOT,
    baselinePath = BASELINE_PATH,
): CoverageBaseline | undefined {
    const commit = git(["cat-file", "-e", `${reference}^{commit}`], repositoryRoot);
    if (commit.exitCode !== 0) throw new Error(`Coverage baseline reference is not a commit: ${reference}`);

    const repositoryPaths = [
        normalizePath(relative(repositoryRoot, baselinePath)),
        "quality/ci/coverage-baseline.json",
    ];
    let readFailure = "";
    for (const repositoryPath of repositoryPaths) {
        const show = git(["show", `${reference}:${repositoryPath}`], repositoryRoot);
        if (show.exitCode === 0) return parseBaseline(show.stdout, `Coverage baseline at ${reference}`);
        readFailure ||= show.stderr.trim();
    }

    const tree = git(["ls-tree", "-r", "--name-only", reference, "--", ...repositoryPaths], repositoryRoot);
    if (tree.exitCode !== 0) throw new Error(tree.stderr.trim() || `Cannot inspect coverage baseline at ${reference}`);
    if (tree.stdout.trim().length === 0) return undefined;
    throw new Error(readFailure || `Cannot read coverage baseline at ${reference}`);
}
