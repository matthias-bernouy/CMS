import { describe, expect, test } from "bun:test";
import { checkWorkspaceArchitecture } from "../core/checkWorkspace";
import { createWorkspaceFixture, manifest, ofKind } from "./checkWorkspace.fixture";

const { createWorkspace } = createWorkspaceFixture();

describe("workspace package boundaries", () => {
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
            "packages/foundation/base/tsconfig.json": `${JSON.stringify(
                {
                    compilerOptions: { baseUrl: ".", paths: { "domain-private/*": ["../../features/domain/src/*"] } },
                },
                null,
                2,
            )}\n`,
            "packages/foundation/base/src/index.ts": "export { privateValue } from 'domain-private/private';\n",
        });
        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "cross-package-source-import")).toHaveLength(1);
        expect(ofKind(violations, "reversed-layer-dependency")).toHaveLength(1);
    });

    test("reports nested code export entries absent from package exports", async () => {
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
});
