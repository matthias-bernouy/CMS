import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAuthorTests } from "../src/release/author-tests";

const roots: string[] = [];

afterEach(async () => {
    delete process.env.ULVIA_AUTHOR_TEST_SECRET;
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("integration-owned release tests", () => {
    test("skips sources without tests", async () => {
        expect(await runAuthorTests(await temporaryRoot())).toBeFalse();
    });

    test("runs tests with a minimal environment", async () => {
        const root = await temporaryRoot();
        const tests = join(root, "tests", "checks");
        await mkdir(tests, { recursive: true });
        process.env.ULVIA_AUTHOR_TEST_SECRET = "must-not-leak";
        await writeFile(
            join(tests, "environment.test.ts"),
            [
                'import { expect, test } from "bun:test";',
                'test("uses the isolated author environment", () => {',
                "    expect(process.env.ULVIA_AUTHOR_TEST_SECRET).toBeUndefined();",
                "});",
            ].join("\n"),
        );

        expect(await runAuthorTests(root)).toBeTrue();
    });

    test("uses the nearest parent Bun test configuration", async () => {
        const workspace = await temporaryRoot();
        const root = join(workspace, "integrations", "example");
        const tests = join(root, "tests");
        await mkdir(tests, { recursive: true });
        await writeFile(join(workspace, "bunfig.toml"), '[test]\npreload = ["./preload.ts"]\n');
        await writeFile(join(workspace, "preload.ts"), "globalThis.__ULVIA_AUTHOR_PRELOAD__ = true;\n");
        await writeFile(
            join(tests, "configured.test.ts"),
            [
                'import { expect, test } from "bun:test";',
                'test("loads the parent configuration", () => {',
                "    expect(globalThis.__ULVIA_AUTHOR_PRELOAD__).toBeTrue();",
                `    expect(process.cwd()).toBe(${JSON.stringify(workspace)});`,
                "});",
            ].join("\n"),
        );

        expect(await runAuthorTests(root)).toBeTrue();
    });
});

async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "ulvia-author-tests-"));
    roots.push(root);
    return root;
}
