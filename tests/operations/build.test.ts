import { expect, test } from "bun:test";
import { runBuild } from "./distribution/buildFixture";

const workspace = [
    ["bun", "run", "infra/bootstrap.ts"],
    ["bun", "x", "tsc", "--build"],
    ["bun", "run", "--cwd", "packages/features/content", "build:browser"],
];

test("unversioned builds prepare workspace outputs without building distribution artifacts", async () => {
    const result = await runBuild([]);
    expect(result.status).toBe(0);
    expect(result.commands).toEqual(workspace);
    expect(result.stdout).toContain("workspace build done");
});

test.each(["1.2.3", "1.2.3-beta.1"])(
    "versioned builds snapshot exact contracts, images and CLI for %s",
    async (version) => {
        const result = await runBuild(["--version", version]);
        expect(result.status).toBe(0);
        expect(result.commands).toEqual([
            ...workspace,
            ["git", "rev-parse", "HEAD"],
            ["bun", "run", "infra/images/build.ts", "build", "--version", version],
            ["bun", "run", "infra/cli/build.ts", "build", "--version", version],
            ["docker", "image", "inspect", `docker.io/cyaxis/ulvia-edge:${version}`],
            ["docker", "image", "inspect", `docker.io/cyaxis/ulvia-provider:${version}`],
        ]);
        expect(result.receipt?.version).toBe(version);
        expect(result.receipt?.sha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(result.receipt?.catalogueSha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(result.receipt?.images).toHaveLength(2);
    },
);

for (const args of [["--version"], ["--version", "1.0"], ["--version", "1.2.3", "all"], ["--stack-version", "1.2.3"]]) {
    test(`invalid build arguments fail before compilation: ${JSON.stringify(args)}`, async () => {
        const result = await runBuild(args);
        expect(result.status).not.toBe(0);
        expect(result.commands).toEqual([]);
        expect(result.stderr).toContain("Usage: bun run build [--version <version>]");
    });
}

test("image failures leave no publishable receipt and stop before CLI packaging", async () => {
    const result = await runBuild(["--version", "1.2.3"], true);
    expect(result.status).not.toBe(0);
    expect(result.commands.at(-1)).toEqual(["bun", "run", "infra/images/build.ts", "build", "--version", "1.2.3"]);
    expect(result.receipt).toBeNull();
    expect(result.stderr).toContain("exited with 7");
});
