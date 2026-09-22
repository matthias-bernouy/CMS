import { expect, test } from "bun:test";
import { checkWorkspaceArchitecture } from "../core/checkWorkspace";
import { repositoryArchitectureOptions } from "../repository/repositoryPolicy";
import { createWorkspaceFixture, manifest, ofKind } from "./checkWorkspace.fixture";

const { createWorkspace } = createWorkspaceFixture();

test("Delivery imports only public content capabilities, including type and dynamic imports", async () => {
    const root = await createWorkspace({
        "packages/features/cms-content/package.json": manifest("@bernouy/cms-content", {
            exports: {
                ".": "./src/index.ts",
                "./rendering": "./src/rendering.ts",
                "./files": "./src/files.ts",
                "./files/local-fs": "./src/local.ts",
            },
        }),
        "packages/features/cms-content/src/index.ts": "export type CmsRepository = {};",
        "packages/features/cms-content/src/rendering.ts": "export type ContentReader = {};",
        "packages/features/cms-content/src/files.ts": "export const mutation = true;",
        "packages/features/cms-content/src/local.ts": "export const filesystem = true;",
        "packages/surfaces/cms-delivery/package.json": manifest("@bernouy/cms-delivery", {
            dependencies: { "@bernouy/cms-content": "workspace:*" },
        }),
        "packages/surfaces/cms-delivery/src/index.ts": [
            "import type { ContentReader } from '@bernouy/cms-content/rendering';",
            "import type { CmsRepository } from '@bernouy/cms-content';",
            "void import('@bernouy/cms-content/files');",
            "void import('@bernouy/cms-content/files/local-fs');",
        ].join("\n"),
    });
    const violations = await checkWorkspaceArchitecture({
        rootDir: root,
        packageImportAllowlist: repositoryArchitectureOptions(root).packageImportAllowlist,
    });
    expect(ofKind(violations, "restricted-package-import")).toHaveLength(3);
    expect(ofKind(violations, "surface-runtime-adapter")).toHaveLength(1);
});

test("browser graphs reject even lazy Sharp imports", async () => {
    const root = await createWorkspace({
        "packages/features/content/package.json": manifest("@fixture/content", {
            exports: { "./editor": "./src/editor.ts" },
        }),
        "packages/features/content/src/editor.ts": "export const optimize = () => import('sharp');",
    });
    expect(ofKind(await checkWorkspaceArchitecture({ rootDir: root }), "browser-runtime-adapter")).toHaveLength(1);
});
