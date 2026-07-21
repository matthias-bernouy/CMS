import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readReferenceBaseline } from "../../coverage/policy/git";

const repositories: string[] = [];

afterEach(async () => {
    await Promise.all(repositories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function git(repository: string, args: string[]): void {
    const result = Bun.spawnSync(["git", ...args], { cwd: repository, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

test("coverage policy reads the baseline from its legacy location during migration", async () => {
    const repository = await mkdtemp(join(tmpdir(), "cmscore-coverage-git-"));
    repositories.push(repository);
    git(repository, ["init", "--quiet"]);
    git(repository, ["config", "user.email", "quality@example.invalid"]);
    git(repository, ["config", "user.name", "Quality Test"]);

    const legacyPath = join(repository, "quality/ci/coverage-baseline.json");
    await mkdir(dirname(legacyPath), { recursive: true });
    await writeFile(legacyPath, JSON.stringify({
        schemaVersion: 1,
        bunVersion: "1.3.14",
        packages: {},
    }));
    git(repository, ["add", "--all"]);
    git(repository, ["commit", "--quiet", "--message", "legacy coverage baseline"]);

    const baseline = readReferenceBaseline(
        "HEAD",
        repository,
        join(repository, "quality/ci/coverage/baseline.json"),
    );
    expect(baseline?.bunVersion).toBe("1.3.14");
});
