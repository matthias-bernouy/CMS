import { REPOSITORY_ROOT } from "../file-size/git";

const POLICY_ENTRY_PATHS = [
    "quality/ci/repository-shape/check.ts",
    "quality/ci/repository-shape/directory-fanout/ratchet.ts",
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

function requireGit(args: string[], failure: string, repositoryRoot: string): string {
    const result = git(args, repositoryRoot);
    if (result.exitCode !== 0) throw new Error(result.stderr.trim() || failure);
    return result.stdout;
}

function commitExists(reference: string, repositoryRoot: string): boolean {
    return git(["cat-file", "-e", `${reference}^{commit}`], repositoryRoot).exitCode === 0;
}

function policyExists(reference: string, repositoryRoot: string): boolean {
    return POLICY_ENTRY_PATHS.some(
        (path) => git(["cat-file", "-e", `${reference}:${path}`], repositoryRoot).exitCode === 0,
    );
}

export function resolveDirectoryFanoutReference(
    requested: string | undefined,
    repositoryRoot = REPOSITORY_ROOT,
): string | undefined {
    const candidate = requested && !/^0+$/.test(requested) ? requested : "HEAD^";
    if (!commitExists(candidate, repositoryRoot)) {
        if (candidate === "HEAD^" && commitExists("HEAD", repositoryRoot)) return undefined;
        throw new Error(`Directory-fanout baseline reference is not a commit: ${candidate}`);
    }
    if (policyExists(candidate, repositoryRoot)) return candidate;
    const introduction = requireGit(
        ["log", "--reverse", "--format=%H", `${candidate}..HEAD`, "--", ...POLICY_ENTRY_PATHS],
        "Cannot locate the directory-fanout policy introduction",
        repositoryRoot,
    ).trim().split(/\r?\n/)[0];
    if (introduction && commitExists(`${introduction}^`, repositoryRoot)) return `${introduction}^`;
    return candidate;
}

export function listBaselinePaths(reference: string, repositoryRoot = REPOSITORY_ROOT): string[] {
    return requireGit(
        ["ls-tree", "-r", "--name-only", "-z", reference],
        `Cannot list repository files at ${reference}`,
        repositoryRoot,
    ).split("\0").filter(Boolean);
}
