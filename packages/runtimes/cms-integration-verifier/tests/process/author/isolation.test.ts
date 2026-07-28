import { describe, expect, test } from "bun:test";
import { runAuthorSuiteInVm } from "../../../src/sandbox/process/author/childRuntime";
import { createAuthorSuiteExecutor } from "../../../src/sandbox/process/author";
import { authorSuite, suiteSource, temporaryRoot } from "./support";

describe("author suite trust boundary", () => {
    test("keeps process, fetch, credentials, and the host bridge outside the VM realm", async () => {
        const result = await runAuthorSuiteInVm(
            {
                schema: "cms.integration.author-suite-child-input.v1",
                bundleSource: `
                    globalThis.__cmsAuthorSuite = { tests: [{ name: "isolation", async execute(context) {
                        if (typeof process !== "undefined" || typeof fetch !== "undefined") throw new Error();
                        if (typeof __cmsHostBridge !== "undefined") throw new Error();
                        let escaped = false;
                        try {
                            Reflect.get(context.query, "constructor")("return process")();
                        } catch {
                            escaped = true;
                        }
                        if (!escaped) throw new Error();
                        const rows = await context.query("select 1");
                        if (rows[0].value !== "safe") throw new Error();
                    } }] };
                `,
                fixtures: {},
            },
            async (request) => {
                expect(request).not.toContain("postgresql://");
                expect(request).not.toContain("repository-token");
                return JSON.stringify({ ok: true, rows: [{ value: "safe" }] });
            },
        );

        expect(result.tests).toHaveLength(1);
        expect(result.tests[0]).toMatchObject({ name: "isolation", outcome: "passed" });
    });

    test("kills a non-settling suite on its own bounded deadline", async () => {
        const temporary = await temporaryRoot();
        try {
            const suite = await authorSuite(suiteSource("await new Promise(() => undefined);"));
            const result = await createAuthorSuiteExecutor({ tempRoot: temporary.root, timeoutMs: 100 }).execute(
                suite,
                async () => [],
                new AbortController().signal,
            );

            expect(result).toMatchObject({
                outcome: "infrastructure-failure",
                diagnosticCode: "author-suite-timeout",
            });
        } finally {
            await temporary.cleanup();
        }
    }, 20_000);

    test("bounds the untrusted NDJSON output before parsing it", async () => {
        const temporary = await temporaryRoot();
        try {
            const suite = await authorSuite(suiteSource('await context.query("x".repeat(4_096));'));
            const result = await createAuthorSuiteExecutor({
                tempRoot: temporary.root,
                maxOutputBytes: 1_024,
            }).execute(suite, async () => [], new AbortController().signal);

            expect(result).toMatchObject({
                outcome: "infrastructure-failure",
                diagnosticCode: "author-suite-output-limit",
            });
        } finally {
            await temporary.cleanup();
        }
    }, 20_000);
});
