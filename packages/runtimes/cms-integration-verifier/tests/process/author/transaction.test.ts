import { describe, expect, test } from "bun:test";
import type { AuthorSuiteExecutor } from "../../../src/sandbox/process/author";
import { executeAuthorSuiteTransaction } from "../../../src/sandbox/service/postgres/suites/author";
import { authorSuite, suiteSource } from "./support";

describe("author suite PostgreSQL transaction", () => {
    test("keeps the database URI in the parent and always rolls author mutations back", async () => {
        const suite = await authorSuite(suiteSource("return;"));
        const statements: string[] = [];
        let closed = false;
        const database = {
            async unsafe(statement: string) {
                statements.push(statement);
                return statement === "insert into probe(value) values ($1) returning value"
                    ? [{ value: "temporary" }]
                    : [];
            },
            async close() {
                closed = true;
            },
        };
        const executor: AuthorSuiteExecutor = {
            async execute(input, query) {
                expect(input).toBe(suite);
                expect(JSON.stringify(input)).not.toContain("postgresql://");
                expect(await query("insert into probe(value) values ($1) returning value", ["temporary"])).toEqual([
                    { value: "temporary" },
                ]);
                return {
                    suiteId: input.suiteId,
                    suiteDigest: input.contentDigest,
                    outcome: "passed",
                    durationMs: 1,
                    evidenceDigest: "a".repeat(64),
                };
            },
        };

        const result = await executeAuthorSuiteTransaction(database, executor, suite, new AbortController().signal);

        expect(result.outcome).toBe("passed");
        expect(statements[0]).toBe("BEGIN");
        expect(statements).toContain("insert into probe(value) values ($1) returning value");
        expect(statements.at(-1)).toBe("ROLLBACK");
        expect(closed).toBe(true);
    });

    test("rolls back and closes even when isolated execution fails", async () => {
        const suite = await authorSuite(suiteSource("return;"));
        const statements: string[] = [];
        let closed = false;
        const database = {
            async unsafe(statement: string) {
                statements.push(statement);
                return [];
            },
            async close() {
                closed = true;
            },
        };
        const executor: AuthorSuiteExecutor = {
            async execute() {
                throw new Error("isolated failure");
            },
        };

        await expect(
            executeAuthorSuiteTransaction(database, executor, suite, new AbortController().signal),
        ).rejects.toThrow("isolated failure");
        expect(statements.at(-1)).toBe("ROLLBACK");
        expect(closed).toBe(true);
    });
});
