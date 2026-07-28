import { describe, expect, test } from "bun:test";
import { createAuthorSuiteExecutor } from "../../../src/sandbox/process/author";
import { authorSuite, suiteSource, temporaryRoot } from "./support";

describe("isolated author suite subprocess", () => {
    test("executes exact fixtures and mediated queries with deterministic evidence", async () => {
        const temporary = await temporaryRoot();
        try {
            const suite = await authorSuite(
                suiteSource(`
                    const rows = await context.query("select $1::text as value", ["expected"]);
                    expect(rows).toEqual([{ value: "expected" }]);
                    expect(context.fixture("fixtures/payload.txt").text()).toBe("payload");
                    expect([...context.fixture("fixtures/data.bin").bytes()]).toEqual([0, 1, 2, 255]);
                `),
                [
                    {
                        path: "fixtures/data.bin",
                        file: { encoding: "base64", content: "AAEC/w==" },
                    },
                    {
                        path: "fixtures/payload.txt",
                        file: { encoding: "utf8", content: "payload" },
                    },
                ],
            );
            const calls: unknown[] = [];
            const query = async (statement: string, parameters: readonly unknown[] = []) => {
                calls.push({ statement, parameters });
                return [{ value: "expected" }];
            };
            const executor = createAuthorSuiteExecutor({ tempRoot: temporary.root });
            const first = await executor.execute(suite, query, new AbortController().signal);
            const second = await executor.execute(suite, query, new AbortController().signal);

            expect(first).toMatchObject({ outcome: "passed", suiteDigest: suite.contentDigest });
            expect(first.evidenceDigest).toBe(second.evidenceDigest);
            expect(calls).toEqual([
                { statement: "select $1::text as value", parameters: ["expected"] },
                { statement: "select $1::text as value", parameters: ["expected"] },
            ]);
        } finally {
            await temporary.cleanup();
        }
    }, 20_000);

    test("returns canonical failed evidence without exposing thrown messages", async () => {
        const temporary = await temporaryRoot();
        try {
            const secret = "must-not-escape";
            const suite = await authorSuite(suiteSource(`throw new Error(${JSON.stringify(secret)});`));
            const result = await createAuthorSuiteExecutor({ tempRoot: temporary.root }).execute(
                suite,
                async () => [],
                new AbortController().signal,
            );

            expect(result).toMatchObject({ outcome: "failed", diagnosticCode: "author-suite-failed" });
            expect(JSON.stringify(result)).not.toContain(secret);
            expect(result.evidenceDigest).toHaveLength(64);
        } finally {
            await temporary.cleanup();
        }
    }, 20_000);

    test("rejects transaction control before it reaches the database bridge", async () => {
        const temporary = await temporaryRoot();
        try {
            const suite = await authorSuite(suiteSource('await context.query("COMMIT");'));
            let called = false;
            const result = await createAuthorSuiteExecutor({ tempRoot: temporary.root }).execute(
                suite,
                async () => {
                    called = true;
                    return [];
                },
                new AbortController().signal,
            );

            expect(result.outcome).toBe("failed");
            expect(called).toBe(false);
        } finally {
            await temporary.cleanup();
        }
    }, 20_000);
});
