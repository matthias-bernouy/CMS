import { describe, expect, test } from "bun:test";
import { checkWorkspaceArchitecture } from "../core/checkWorkspace";
import { createWorkspaceFixture, manifest, ofKind } from "./checkWorkspace.fixture";

const { createWorkspace } = createWorkspaceFixture();

describe("workspace source policies", () => {
    test("ratchets environment reads and reports only new occurrences", async () => {
        const root = await createWorkspace({
            "packages/features/domain/package.json": manifest("@fixture/domain", {
                exports: { ".": "./src/index.ts" },
            }),
            "packages/features/domain/src/index.ts": [
                "export const first = process.env.MODE;",
                "export const second = process.env.MODE;",
                'export const bracket = process [ "env" ] . TOKEN;',
                'export const bunBracket = Bun["env"].SECRET;',
                "export const globalProcess = globalThis.process.env.DEBUG;",
                "const { env: processEnv } = process;",
                "const { env: bunEnv } = Bun;",
                "",
            ].join("\n"),
        });
        const violations = await checkWorkspaceArchitecture({
            rootDir: root,
            environmentReadBaseline: {
                "packages/features/domain/src/index.ts": {
                    "process.env.MODE": 1,
                    'process["env"].TOKEN': 1,
                    "process.env": 1,
                },
            },
        });
        const environmentReads = ofKind(violations, "environment-read");
        expect(environmentReads).toHaveLength(4);
        expect(environmentReads.map(({ line }) => line)).toEqual([2, 4, 5, 7]);
        expect(environmentReads.map(({ message }) => message)).toEqual([
            expect.stringContaining("process.env.MODE"),
            expect.stringContaining('Bun["env"].SECRET'),
            expect.stringContaining("globalThis.process.env.DEBUG"),
            expect.stringContaining("Bun.env"),
        ]);
    });

    test("rejects inline import types throughout the repository while allowing runtime imports", async () => {
        const root = await createWorkspace({
            "packages/features/domain/package.json": manifest("@fixture/domain", {
                exports: { ".": "./src/index.ts" },
            }),
            "packages/features/domain/src/index.ts": 'export type A = import("node:fs").Stats;\n',
            "packages/features/domain/src/types.d.ts": 'type B = import("node:path");\n',
            "quality/check.ts": 'type C = Pick<import("node:fs").Stats, "size">;\n',
            "tests/types.test.ts": 'type D = typeof import("node:fs");\n',
            "infra/build.ts": 'type E = import(\n "node:fs"\n).Stats;\n',
            "build.ts":
                'import type { Stats } from "node:fs";\nconst fs = await import("node:fs");\n// import("ignored").Comment\nconst example = `import("ignored").String`;\n',
        });
        const violations = ofKind(await checkWorkspaceArchitecture({ rootDir: root }), "inline-import-type");
        expect(violations.map(({ file, line }) => ({ file, line }))).toEqual([
            { file: "infra/build.ts", line: 1 },
            { file: "packages/features/domain/src/index.ts", line: 1 },
            { file: "packages/features/domain/src/types.d.ts", line: 1 },
            { file: "quality/check.ts", line: 1 },
            { file: "tests/types.test.ts", line: 1 },
        ]);
    });

    test("reports focused tests while allowing skips and DOM focus", async () => {
        const root = await createWorkspace({
            "packages/features/domain/package.json": manifest("@fixture/domain", {
                exports: { ".": "./src/index.ts" },
            }),
            "packages/features/domain/src/index.ts": "export const domain = true;\n",
            "quality/focused.test.ts": [
                "import { test as bunTest } from 'bun:test';",
                "import * as bt from 'bun:test';",
                "test.only('one', () => {});",
                "describe.skip('two', () => {});",
                "it.focus('three', () => {});",
                "test.only.each([1])('four', () => {});",
                "test['only']('five', () => {});",
                "bunTest.only('six', () => {});",
                "bt.test.only('seven', () => {});",
                "input.focus();",
                "",
            ].join("\n"),
            "packages/features/domain/__tests__/focused.ts": "test.only('nested', () => {});\n",
        });
        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "focused-test")).toHaveLength(7);
    });
});
