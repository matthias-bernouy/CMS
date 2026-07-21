import { resolve } from "node:path";
import { countPhysicalLines, isGovernedFile, MAX_FILE_LINES } from "./policy";

export const REPOSITORY_ROOT = resolve(import.meta.dir, "../../../..");
const POLICY_ENTRY_PATHS = [
    "quality/ci/repository-shape/file-size/ratchet.ts",
    "quality/ci/file-size-ratchet.ts",
];

type GitResult = { exitCode: number; stdout: string; stderr: string };

function git(args: string[], repositoryRoot = REPOSITORY_ROOT): GitResult {
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

function requireGit(args: string[], failure: string, repositoryRoot = REPOSITORY_ROOT): string {
    const result = git(args, repositoryRoot);
    if (result.exitCode !== 0) throw new Error(result.stderr.trim() || failure);
    return result.stdout;
}

function nullSeparatedPaths(output: string): string[] {
    return output.split("\0").filter(Boolean);
}

function commitExists(reference: string, repositoryRoot: string): boolean {
    return git(["cat-file", "-e", `${reference}^{commit}`], repositoryRoot).exitCode === 0;
}

function policyExists(reference: string, repositoryRoot: string): boolean {
    return POLICY_ENTRY_PATHS.some(
        (path) => git(["cat-file", "-e", `${reference}:${path}`], repositoryRoot).exitCode === 0,
    );
}

export function resolveFileSizeReference(
    requested: string | undefined,
    repositoryRoot = REPOSITORY_ROOT,
): string | undefined {
    const candidate = requested && !/^0+$/.test(requested) ? requested : "HEAD^";
    if (!commitExists(candidate, repositoryRoot)) {
        if (candidate === "HEAD^" && commitExists("HEAD", repositoryRoot)) return undefined;
        throw new Error(`File-size baseline reference is not a commit: ${candidate}`);
    }
    if (policyExists(candidate, repositoryRoot)) return candidate;
    const introduction = requireGit(
        ["log", "--reverse", "--format=%H", `${candidate}..HEAD`, "--", ...POLICY_ENTRY_PATHS],
        "Cannot locate the file-size policy introduction",
        repositoryRoot,
    ).trim().split(/\r?\n/)[0];
    if (introduction && commitExists(`${introduction}^`, repositoryRoot)) return `${introduction}^`;
    return candidate;
}

export function listCurrentPaths(repositoryRoot = REPOSITORY_ROOT): string[] {
    return nullSeparatedPaths(
        requireGit(
            ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            "Cannot list current repository files",
            repositoryRoot,
        ),
    );
}

export function parseRenames(nameStatus: string): Map<string, string> {
    const renames = new Map<string, string>();
    const fields = nameStatus.split("\0").filter(Boolean);
    for (let index = 0; index < fields.length;) {
        const status = fields[index++];
        const source = fields[index++];
        if (!status || !source) break;
        if (!status.startsWith("R") && !status.startsWith("C")) continue;
        const destination = fields[index++];
        if (status.startsWith("R") && destination) renames.set(destination, source);
    }
    return renames;
}

export function renamedSources(reference: string, repositoryRoot = REPOSITORY_ROOT): Map<string, string> {
    return parseRenames(
        requireGit(
            ["diff", "--find-renames", "--name-status", "-z", reference, "--"],
            `Cannot compare file renames with ${reference}`,
            repositoryRoot,
        ),
    );
}

function readReferenceFile(reference: string, path: string, repositoryRoot: string): string | undefined {
    const result = git(["show", `${reference}:${path}`], repositoryRoot);
    if (result.exitCode === 0) return result.stdout;
    const exists = git(["cat-file", "-e", `${reference}:${path}`], repositoryRoot);
    if (exists.exitCode !== 0) return undefined;
    throw new Error(result.stderr.trim() || `Cannot read ${path} at ${reference}`);
}

export function loadBaselineLines(
    reference: string,
    currentLines: ReadonlyMap<string, number>,
    renames: ReadonlyMap<string, string>,
    repositoryRoot = REPOSITORY_ROOT,
): Map<string, number> {
    const paths = new Set<string>();
    for (const [path, lines] of currentLines) {
        const sourcePath = renames.get(path) ?? path;
        if (isGovernedFile(path) && isGovernedFile(sourcePath) && lines > MAX_FILE_LINES) paths.add(sourcePath);
    }
    const baseline = new Map<string, number>();
    for (const path of paths) {
        const source = readReferenceFile(reference, path, repositoryRoot);
        if (source !== undefined) baseline.set(path, countPhysicalLines(source));
    }
    return baseline;
}
