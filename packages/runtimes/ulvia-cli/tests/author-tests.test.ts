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
});

async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "ulvia-author-tests-"));
    roots.push(root);
    return root;
}
