import { describe, expect, test } from "bun:test";
import {
    checkWorkspaceArchitecture,
    type WorkspaceCheckOptions,
} from "../core/checkWorkspace";
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
                "export const bracket = process [ \"env\" ] . TOKEN;",
                "export const bunBracket = Bun[\"env\"].SECRET;",
                "export const globalProcess = globalThis.process.env.DEBUG;",
                "const { env: processEnv } = process;", "const { env: bunEnv } = Bun;", "",
            ].join("\n"),
        });
        const violations = await checkWorkspaceArchitecture({
            rootDir: root,
            environmentReadBaseline: {
                "packages/features/domain/src/index.ts": {
                    "process.env.MODE": 1, "process[\"env\"].TOKEN": 1, "process.env": 1,
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

    test("reports focused tests while allowing skips and DOM focus", async () => {
        const root = await createWorkspace({
            "packages/features/domain/package.json": manifest("@fixture/domain", {
                exports: { ".": "./src/index.ts" },
            }),
            "packages/features/domain/src/index.ts": "export const domain = true;\n",
            "quality/focused.test.ts": [
                "import { test as bunTest } from 'bun:test';", "import * as bt from 'bun:test';",
                "test.only('one', () => {});", "describe.skip('two', () => {});",
                "it.focus('three', () => {});", "test.only.each([1])('four', () => {});",
                "test['only']('five', () => {});", "bunTest.only('six', () => {});",
                "bt.test.only('seven', () => {});", "input.focus();", "",
            ].join("\n"),
            "packages/features/domain/__tests__/focused.ts": "test.only('nested', () => {});\n",
        });
        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "focused-test")).toHaveLength(7);
    });

    test("reports generated asset drift", async () => {
        const root = await createWorkspace({ "generated/control.js": "stale\n" });
        const options: WorkspaceCheckOptions = {
            rootDir: root,
            generatedAssets: [{ path: "generated/control.js", generate: async () => "fresh\n" }],
        };
        const violations = await checkWorkspaceArchitecture(options);
        expect(ofKind(violations, "generated-asset-drift")).toHaveLength(1);
    });
});
