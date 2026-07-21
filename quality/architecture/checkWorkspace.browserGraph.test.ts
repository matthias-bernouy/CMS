import { describe, expect, test } from "bun:test";
import { checkWorkspaceArchitecture } from "./checkWorkspace";
import { createWorkspaceFixture, manifest, ofKind } from "./checkWorkspace.fixture";

const { createWorkspace } = createWorkspaceFixture();

describe("browser import graph", () => {
    test("follows declared workspace export targets", async () => {
        const root = await createWorkspace({
            "packages/features/shared/package.json": manifest("@fixture/shared", {
                exports: { ".": "./src/index.ts", "./safe": "./src/safe.ts" },
            }),
            "packages/features/shared/src/index.ts": "export const shared = true;\n",
            "packages/features/shared/src/safe.ts": "export { unsafe } from './unsafe';\n",
            "packages/features/shared/src/unsafe.ts": [
                "import { readFile } from 'node:fs';", "export const unsafe = readFile;", "",
            ].join("\n"),
            "packages/features/ui/package.json": manifest("@fixture/ui", {
                dependencies: { "@fixture/shared": "workspace:*" },
                exports: { ".": "./src/index.ts", "./components": "./src/components.ts" },
            }),
            "packages/features/ui/src/index.ts": "export const ui = true;\n",
            "packages/features/ui/src/components.ts": "export { unsafe } from '@fixture/shared/safe';\n",
        });
        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "browser-runtime-adapter")).toHaveLength(1);
        expect(ofKind(violations, "browser-runtime-adapter")[0]!.file).toMatch(/shared\/src\/unsafe\.ts$/);
    });

    test("does not traverse type-only workspace edges", async () => {
        const root = await createWorkspace({
            "packages/features/shared/package.json": manifest("@fixture/shared", {
                exports: { ".": "./src/index.ts", "./contracts": "./src/contracts.ts" },
            }),
            "packages/features/shared/src/index.ts": "export const shared = true;\n",
            "packages/features/shared/src/contracts.ts": [
                "import { readFile } from 'node:fs';", "export type Contract = typeof readFile;", "",
            ].join("\n"),
            "packages/features/ui/package.json": manifest("@fixture/ui", {
                dependencies: { "@fixture/shared": "workspace:*" },
                exports: { ".": "./src/index.ts", "./components": "./src/components.ts" },
            }),
            "packages/features/ui/src/index.ts": "export const ui = true;\n",
            "packages/features/ui/src/components.ts": [
                "type Contract = import('@fixture/shared/contracts').Contract;",
                "export const component: Contract | undefined = undefined;", "",
            ].join("\n"),
        });
        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "browser-runtime-adapter")).toHaveLength(0);
    });

    test("mirrors a missing generated export target to its source", async () => {
        const root = await createWorkspace({
            "packages/features/ui/package.json": manifest("@fixture/ui", {
                exports: { ".": "./dist/index.js", "./browser": "./dist/browser.js" },
            }),
            "packages/features/ui/src/index.ts": "export const ui = true;\n",
            "packages/features/ui/src/browser.ts": "export { unsafe } from './unsafe.js';\n",
            "packages/features/ui/src/unsafe.ts": [
                "import { readFile } from 'fs/promises';", "export const unsafe = readFile;", "",
            ].join("\n"),
        });
        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "browser-runtime-adapter")).toHaveLength(1);
        expect(ofKind(violations, "browser-runtime-adapter")[0]!.file).toMatch(/ui\/src\/unsafe\.ts$/);
    });
});
