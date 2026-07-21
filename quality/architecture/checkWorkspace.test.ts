import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
    checkWorkspaceArchitecture,
    type ArchitectureViolation,
    type WorkspaceCheckOptions,
} from "./checkWorkspace";

const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("workspace architecture checker", () => {
    test("accepts a clean dependency direction and declared public imports", async () => {
        const root = await createWorkspace({
            "packages/foundation/base/package.json": manifest("@fixture/base", {
                exports: { ".": "./src/index.ts", "./safe": "./src/safe.ts" },
            }),
            "packages/foundation/base/src/index.ts": "export const base = true;\n",
            "packages/foundation/base/src/safe.ts": "export const safe = true;\n",
            "packages/features/domain/package.json": manifest("@fixture/domain", {
                dependencies: { "@fixture/base": "workspace:*" },
                exports: { ".": "./src/index.ts" },
            }),
            "packages/features/domain/src/index.ts": "export { safe } from '@fixture/base/safe';\n",
            "packages/surfaces/web/package.json": manifest("@fixture/web", {
                dependencies: { "@fixture/domain": "workspace:*" },
                exports: { ".": "./src/index.ts", "./browser": "./src/browser.ts" },
            }),
            "packages/surfaces/web/src/index.ts": "export { safe } from '@fixture/domain';\n",
            "packages/surfaces/web/src/browser.ts": "export { browserSafe } from './browserSafe';\n",
            "packages/surfaces/web/src/browserSafe.ts": "export const browserSafe = true;\n",
            "packages/runtimes/server/package.json": manifest("@fixture/server", {
                dependencies: { "@fixture/web": "workspace:*" },
                exports: { ".": "./src/index.ts" },
            }),
            "packages/runtimes/server/src/index.ts": "export const port = process.env.PORT;\n",
        });

        expect(await checkWorkspaceArchitecture({ rootDir: root })).toEqual([]);
    });

    test("reports reversed layer dependencies from manifests and source imports", async () => {
        const root = await createWorkspace({
            "packages/foundation/base/package.json": manifest("@fixture/base", {
                dependencies: { "@fixture/web": "workspace:*" },
                exports: { ".": "./src/index.ts" },
            }),
            "packages/foundation/base/src/index.ts": "export { web } from '@fixture/web';\n",
            "packages/surfaces/web/package.json": manifest("@fixture/web", {
                exports: { ".": "./src/index.ts" },
            }),
            "packages/surfaces/web/src/index.ts": "export const web = true;\n",
        });

        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "reversed-layer-dependency")).toHaveLength(2);
    });

    test("reports workspace dependency cycles", async () => {
        const root = await createWorkspace({
            "packages/features/a/package.json": manifest("@fixture/a", {
                dependencies: { "@fixture/b": "workspace:*" },
                exports: { ".": "./src/index.ts" },
            }),
            "packages/features/a/src/index.ts": "export const a = true;\n",
            "packages/features/b/package.json": manifest("@fixture/b", {
                dependencies: { "@fixture/a": "workspace:*" },
                exports: { ".": "./src/index.ts" },
            }),
            "packages/features/b/src/index.ts": "export const b = true;\n",
        });

        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "workspace-cycle")).toHaveLength(1);
        expect(ofKind(violations, "workspace-cycle")[0]!.message).toContain("@fixture/a -> @fixture/b");
    });

    test("reports undeclared package subpaths and cross-package src imports", async () => {
        const root = await createWorkspace({
            "packages/features/domain/package.json": manifest("@fixture/domain", {
                exports: { ".": "./src/index.ts" },
            }),
            "packages/features/domain/src/index.ts": "export const publicValue = true;\n",
            "packages/features/domain/src/private.ts": "export const privateValue = true;\n",
            "packages/surfaces/web/package.json": manifest("@fixture/web", {
                dependencies: { "@fixture/domain": "workspace:*" },
                exports: { ".": "./src/index.ts" },
            }),
            "packages/surfaces/web/src/index.ts": [
                "export { privateValue } from '@fixture/domain/private';",
                "export { privateValue as deep } from '../../../features/domain/src/private';",
                "",
            ].join("\n"),
        });

        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "undeclared-subpath")).toHaveLength(1);
        expect(ofKind(violations, "cross-package-source-import")).toHaveLength(1);
    });

    test("checks import type nodes and import-equals external references", async () => {
        const root = await createWorkspace({
            "packages/features/domain/package.json": manifest("@fixture/domain", {
                exports: { ".": "./src/index.ts" },
            }),
            "packages/features/domain/src/index.ts": "export type Public = string;\n",
            "packages/features/domain/src/private.ts": "export type Private = string;\n",
            "packages/features/domain/src/lazy-private.ts": "export const lazyPrivate = true;\n",
            "packages/surfaces/web/package.json": manifest("@fixture/web", {
                dependencies: { "@fixture/domain": "workspace:*" },
                exports: { ".": "./src/index.ts" },
            }),
            "packages/surfaces/web/src/index.ts": [
                "type Private = import('@fixture/domain/private').Private;",
                "import DomainModule = require('../../../features/domain/src/index');",
                "void import('@fixture/domain/lazy-private', { with: { type: 'json' } });",
                "export type Combined = Private & typeof DomainModule;",
                "",
            ].join("\n"),
        });

        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "undeclared-subpath")).toHaveLength(2);
        expect(ofKind(violations, "cross-package-source-import")).toHaveLength(1);
    });

    test("resolves cross-package tsconfig paths in general boundary checks", async () => {
        const root = await createWorkspace({
            "packages/features/domain/package.json": manifest("@fixture/domain", {
                exports: { ".": "./src/index.ts" },
            }),
            "packages/features/domain/src/index.ts": "export const domain = true;\n",
            "packages/features/domain/src/private.ts": "export const privateValue = true;\n",
            "packages/foundation/base/package.json": manifest("@fixture/base", {
                exports: { ".": "./src/index.ts" },
            }),
            "packages/foundation/base/tsconfig.json": `${JSON.stringify({
                compilerOptions: {
                    baseUrl: ".",
                    paths: { "domain-private/*": ["../../features/domain/src/*"] },
                },
            }, null, 2)}\n`,
            "packages/foundation/base/src/index.ts": "export { privateValue } from 'domain-private/private';\n",
        });

        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "cross-package-source-import")).toHaveLength(1);
        expect(ofKind(violations, "reversed-layer-dependency")).toHaveLength(1);
    });

    test("reports nested code export entries that are absent from package exports", async () => {
        const root = await createWorkspace({
            "packages/features/domain/package.json": manifest("@fixture/domain", {
                exports: { ".": "./src/exports/index.ts" },
            }),
            "packages/features/domain/src/exports/index.ts": "export const publicValue = true;\n",
            "packages/features/domain/src/exports/admin/index.tsx": "export const admin = <div />;\n",
        });

        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "undeclared-subpath")).toHaveLength(1);
        expect(ofKind(violations, "undeclared-subpath")[0]!.message).toContain("./admin");
    });

    test("reports runtime adapters in surfaces and transitively reachable browser exports", async () => {
        const root = await createWorkspace({
            "packages/features/domain/package.json": manifest("@fixture/domain", {
                exports: {
                    ".": "./src/index.ts",
                    "./fs": "./src/fs.ts",
                    "./http": "./src/http.ts",
                    "./mongo": "./src/mongo.ts",
                    "./supabase": "./src/supabase.ts",
                },
            }),
            "packages/features/domain/src/index.ts": "export const domain = true;\n",
            "packages/features/domain/src/fs.ts": "export const fs = true;\n",
            "packages/features/domain/src/http.ts": "export const http = true;\n",
            "packages/features/domain/src/mongo.ts": "export const mongo = true;\n",
            "packages/features/domain/src/supabase.ts": "export const supabase = true;\n",
            "packages/surfaces/web/package.json": manifest("@fixture/web", {
                dependencies: { "@fixture/domain": "workspace:*" },
                exports: { ".": "./src/index.ts", "./browser": "./src/browser.ts" },
            }),
            "packages/surfaces/web/src/index.ts": [
                "export { fs } from '@fixture/domain/fs';",
                "export { http } from '@fixture/domain/http';",
                "export { mongo } from '@fixture/domain/mongo';",
                "export { supabase } from '@fixture/domain/supabase';",
                "import { readJsonBody } from 'fixture-web/core/http/readJsonBody';",
                "import { externalClient } from '@acme/sdk/http/client';",
                "void readJsonBody;",
                "void externalClient;",
                "",
            ].join("\n"),
            "packages/surfaces/web/src/browser.ts": [
                "import { externalClient } from '@acme/sdk/http/client';",
                "export { value } from './browserHelper';",
                "void externalClient;",
                "",
            ].join("\n"),
            "packages/surfaces/web/src/browserHelper.ts": [
                "import { readFile } from 'fs/promises';",
                "export const value = readFile;",
                "",
            ].join("\n"),
        });

        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "surface-runtime-adapter")).toHaveLength(4);
        expect(ofKind(violations, "browser-runtime-adapter")).toHaveLength(1);
        expect(ofKind(violations, "browser-runtime-adapter")[0]!.file).toMatch(/browserHelper\.ts$/);
    });

    test("follows package-local path aliases from browser exports", async () => {
        const root = await createWorkspace({
            "packages/features/cms-auth/package.json": manifest("@fixture/cms-auth", {
                exports: { ".": "./src/exports/index.ts", "./components": "./src/exports/components.ts" },
            }),
            "packages/features/cms-auth/tsconfig.json": `${JSON.stringify({
                compilerOptions: {
                    baseUrl: "./src",
                    paths: { "cms-auth/*": ["./*"] },
                },
            }, null, 2)}\n`,
            "packages/features/cms-auth/src/exports/index.ts": "export const auth = true;\n",
            "packages/features/cms-auth/src/exports/components.ts": "export { unsafe } from 'cms-auth/core/unsafe';\n",
            "packages/features/cms-auth/src/core/unsafe.ts": "import { readFile } from 'node:fs'; export const unsafe = readFile;\n",
        });

        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "browser-runtime-adapter")).toHaveLength(1);
        expect(ofKind(violations, "browser-runtime-adapter")[0]!.file).toMatch(/core\/unsafe\.ts$/);
    });

    test("follows declared workspace export targets from browser exports", async () => {
        const root = await createWorkspace({
            "packages/features/shared/package.json": manifest("@fixture/shared", {
                exports: { ".": "./src/index.ts", "./safe": "./src/safe.ts" },
            }),
            "packages/features/shared/src/index.ts": "export const shared = true;\n",
            "packages/features/shared/src/safe.ts": "export { unsafe } from './unsafe';\n",
            "packages/features/shared/src/unsafe.ts": "import { readFile } from 'node:fs'; export const unsafe = readFile;\n",
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

    test("does not traverse type-only workspace edges from browser exports", async () => {
        const root = await createWorkspace({
            "packages/features/shared/package.json": manifest("@fixture/shared", {
                exports: { ".": "./src/index.ts", "./contracts": "./src/contracts.ts" },
            }),
            "packages/features/shared/src/index.ts": "export const shared = true;\n",
            "packages/features/shared/src/contracts.ts": [
                "import { readFile } from 'node:fs';",
                "export type Contract = typeof readFile;",
                "",
            ].join("\n"),
            "packages/features/ui/package.json": manifest("@fixture/ui", {
                dependencies: { "@fixture/shared": "workspace:*" },
                exports: { ".": "./src/index.ts", "./components": "./src/components.ts" },
            }),
            "packages/features/ui/src/index.ts": "export const ui = true;\n",
            "packages/features/ui/src/components.ts": [
                "type Contract = import('@fixture/shared/contracts').Contract;",
                "export const component: Contract | undefined = undefined;",
                "",
            ].join("\n"),
        });

        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "browser-runtime-adapter")).toHaveLength(0);
    });

    test("treats a components package root as browser code when its declared target is generated", async () => {
        const root = await createWorkspace({
            "packages/foundation/components/package.json": manifest("@fixture/components", {
                exports: { ".": "./dist/index.js" },
            }),
            "packages/foundation/components/src/index.ts": "export { unsafe } from './unsafe';\n",
            "packages/foundation/components/src/unsafe.ts": [
                "import { readFile } from 'fs/promises';",
                "export const unsafe = readFile;",
                "",
            ].join("\n"),
        });

        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "browser-runtime-adapter")).toHaveLength(1);
        expect(ofKind(violations, "browser-runtime-adapter")[0]!.file).toMatch(/components\/src\/unsafe\.ts$/);
    });

    test("mirrors a missing generated browser export target back to its source entry", async () => {
        const root = await createWorkspace({
            "packages/features/ui/package.json": manifest("@fixture/ui", {
                exports: { ".": "./dist/index.js", "./browser": "./dist/browser.js" },
            }),
            "packages/features/ui/src/index.ts": "export const ui = true;\n",
            "packages/features/ui/src/browser.ts": "export { unsafe } from './unsafe.js';\n",
            "packages/features/ui/src/unsafe.ts": [
                "import { readFile } from 'fs/promises';",
                "export const unsafe = readFile;",
                "",
            ].join("\n"),
        });

        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "browser-runtime-adapter")).toHaveLength(1);
        expect(ofKind(violations, "browser-runtime-adapter")[0]!.file).toMatch(/ui\/src\/unsafe\.ts$/);
    });

    test("ratchets existing environment reads and reports only new occurrences", async () => {
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
                    "process[\"env\"].TOKEN": 1,
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

    test("reports focused tests while allowing intentional skips and DOM focus", async () => {
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

    test("reports generated asset drift", async () => {
        const root = await createWorkspace({ "generated/control.js": "stale\n" });
        const options: WorkspaceCheckOptions = {
            rootDir: root,
            generatedAssets: [{
                path: "generated/control.js",
                generate: async () => "fresh\n",
            }],
        };

        const violations = await checkWorkspaceArchitecture(options);
        expect(ofKind(violations, "generated-asset-drift")).toHaveLength(1);
    });
});

function manifest(name: string, extra: Record<string, unknown>): string {
    return `${JSON.stringify({ name, ...extra }, null, 2)}\n`;
}

async function createWorkspace(files: Record<string, string>): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cmscore-architecture-"));
    temporaryRoots.push(root);
    for (const [path, contents] of Object.entries(files)) {
        const absolutePath = join(root, path);
        await mkdir(dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, contents);
    }
    return root;
}

function ofKind<K extends ArchitectureViolation["kind"]>(
    violations: readonly ArchitectureViolation[],
    kind: K,
): ArchitectureViolation[] {
    return violations.filter((violation) => violation.kind === kind);
}
