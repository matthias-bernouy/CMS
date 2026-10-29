import { expect, test } from "bun:test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCheckCli } from "../../check-all";

test("failed change detection still runs checks, records complete evidence and returns failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "guardrail-report-"));
    try {
        let calls = 0;
        let output = "";
        const code = await runCheckCli(
            root,
            [],
            async () => {
                calls++;
                return { exitCode: 0, stdout: "complete raw output", stderr: "" };
            },
            (text) => {
                output = text;
            },
        );
        expect(code).toBe(1);
        expect(calls).toBeGreaterThanOrEqual(10);
        expect(output).toContain("Cannot determine changed files");
        const report = JSON.parse(await readFile(join(root, "artifacts/check-all/latest.json"), "utf8"));
        expect(report.results[0].stdout).toBe("complete raw output");
        expect(await readFile(join(root, "artifacts/check-all/latest.txt"), "utf8")).toContain("complete raw output");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
test("report write failures cannot become successful checks", async () => {
    const root = await mkdtemp(join(tmpdir(), "guardrail-write-"));
    try {
        await writeFile(join(root, "artifacts"), "blocked");
        await expect(
            runCheckCli(
                root,
                [],
                async () => ({ exitCode: 0, stdout: "", stderr: "" }),
                () => undefined,
            ),
        ).rejects.toThrow();
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("successful checks preserve complete artifacts and emit the compact review", async () => {
    const root = await mkdtemp(join(tmpdir(), "guardrail-success-"));
    try {
        const child = Bun.spawn(["git", "init", "-q", root], { stdout: "pipe", stderr: "pipe" });
        expect(await child.exited).toBe(0);
        const commit = Bun.spawn(
            [
                "git",
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "--allow-empty",
                "-qm",
                "base",
            ],
            { cwd: root, stdout: "pipe", stderr: "pipe" },
        );
        expect(await commit.exited).toBe(0);
        await writeFile(join(root, "notes.md"), "Notes");
        let output = "";
        expect(
            await runCheckCli(
                root,
                [],
                async () => ({ exitCode: 0, stdout: "verbose detail", stderr: "" }),
                (text) => {
                    output = text;
                },
            ),
        ).toBe(0);
        expect(output).toContain("10 passed, 0 failed");
        expect(output).toContain("documentation only");
        expect(output).not.toContain("verbose detail");
        const evidence = JSON.parse(await readFile(join(root, "artifacts/check-all/latest.json"), "utf8"));
        expect(evidence.changedPaths).toEqual(["notes.md"]);
        expect(evidence.results).toHaveLength(10);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
