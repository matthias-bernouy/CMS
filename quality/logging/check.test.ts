import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findInvalidLogEvents, findServerConsoleCalls } from "./check";

test("the logging check rejects direct server console references outside browser and CLI output", async () => {
    const root = await mkdtemp(join(tmpdir(), "logging-check-"));
    try {
        await mkdir(join(root, "packages/example/src/runtime"), { recursive: true });
        await mkdir(join(root, "packages/features/cms-content/src/browser"), { recursive: true });
        await mkdir(join(root, "packages/runtimes/ulvia-cli/src"), { recursive: true });
        await writeFile(
            join(root, "packages/example/src/runtime/server.ts"),
            [
                "console.error('bad');",
                "globalThis.console.warn('bad');",
                "console['log']('bad');",
                "const { error } = console; error('bad');",
            ].join("\n"),
        );
        await writeFile(
            join(root, "packages/features/cms-content/src/browser/client.ts"),
            "console.warn('allowed');\n",
        );
        await writeFile(join(root, "packages/runtimes/ulvia-cli/src/cli.ts"), "console.log('allowed');\n");

        expect(await findServerConsoleCalls(root)).toEqual([
            "packages/example/src/runtime/server.ts:1",
            "packages/example/src/runtime/server.ts:2",
            "packages/example/src/runtime/server.ts:3",
            "packages/example/src/runtime/server.ts:4",
        ]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("the logging check rejects unstable and dynamic logger event names", async () => {
    const root = await mkdtemp(join(tmpdir(), "logging-events-check-"));
    try {
        await mkdir(join(root, "packages/example/src/runtime"), { recursive: true });
        await writeFile(
            join(root, "packages/example/src/runtime/server.ts"),
            [
                'logger.info("valid.event");',
                'serviceLogger.warn("Human sentence");',
                "this.logger.error(dynamicEvent);",
                'logger.log("info", dynamicEvent);',
                "const audit: Logger = createAudit();",
                "audit.info(dynamicEvent);",
                "interface Context { diagnostics: Logger }",
                "declare const context: Context;",
                "context.diagnostics.warn(dynamicEvent);",
                "const auditChild = logger.child({ component: 'audit' });",
                "auditChild.info(dynamicEvent);",
                "class Service { constructor(private readonly auditTrail: Logger) {} run() { this.auditTrail.error(dynamicEvent); } }",
                "const standalone = createNodeLogger({ service: 'test' });",
                "standalone.warn(dynamicEvent);",
                'other.info("not a logger call");',
            ].join("\n"),
        );

        expect(await findInvalidLogEvents(root)).toEqual([
            "packages/example/src/runtime/server.ts:2",
            "packages/example/src/runtime/server.ts:3",
            "packages/example/src/runtime/server.ts:4",
            "packages/example/src/runtime/server.ts:6",
            "packages/example/src/runtime/server.ts:9",
            "packages/example/src/runtime/server.ts:11",
            "packages/example/src/runtime/server.ts:12",
            "packages/example/src/runtime/server.ts:14",
        ]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
