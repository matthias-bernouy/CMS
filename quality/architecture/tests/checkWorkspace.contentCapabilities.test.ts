import { expect, test } from "bun:test";
import { checkWorkspaceArchitecture } from "../core/checkWorkspace";
import { repositoryArchitectureOptions } from "../repository/repositoryPolicy";
import { createWorkspaceFixture, manifest, ofKind } from "./checkWorkspace.fixture";

const { createWorkspace } = createWorkspaceFixture();
test("Delivery imports only public content capabilities, including type and dynamic imports", async () => {
    const root = await createWorkspace({
        "packages/features/content/package.json": manifest("@bernouy/content", {
            exports: {
                ".": "./src/index.ts",
                "./rendering": "./src/rendering.ts",
                "./mongo": "./src/mongo.ts",
            },
        }),
        "packages/features/content/src/index.ts": "export type ContentRepository = {};",
        "packages/features/content/src/rendering.ts": "export type ContentReader = {};",
        "packages/features/content/src/mongo.ts": "export const persistence = true;",
        "packages/surfaces/cms-edge/package.json": manifest("@bernouy/cms-edge", {
            dependencies: { "@bernouy/content": "workspace:*" },
        }),
        "packages/surfaces/cms-edge/src/index.ts": [
            "import type { ContentReader } from '@bernouy/content/rendering';",
            "import type { ContentRepository } from '@bernouy/content';",
            "void import('@bernouy/content/mongo');",
        ].join("\n"),
    });
    const violations = await checkWorkspaceArchitecture({
        rootDir: root,
        packageImportAllowlist: repositoryArchitectureOptions(root).packageImportAllowlist,
    });
    expect(ofKind(violations, "restricted-package-import")).toHaveLength(2);
    expect(ofKind(violations, "surface-runtime-adapter")).toHaveLength(1);
});

test("browser graphs reject even lazy Sharp imports", async () => {
    const root = await createWorkspace({
        "packages/features/content/package.json": manifest("@fixture/content", {
            exports: { "./bindings": "./src/bindings.ts" },
        }),
        "packages/features/content/src/bindings.ts": "export const optimize = () => import('sharp');",
    });
    expect(ofKind(await checkWorkspaceArchitecture({ rootDir: root }), "browser-runtime-adapter")).toHaveLength(1);
});
