import { describe, expect, test } from "bun:test";
import { checkWorkspaceArchitecture } from "../core/checkWorkspace";
import { createWorkspaceFixture, manifest, ofKind } from "./checkWorkspace.fixture";

const { createWorkspace } = createWorkspaceFixture();

describe("workspace dependency rules", () => {
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
});
