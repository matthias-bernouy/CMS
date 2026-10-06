import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { checkWorkspaceArchitecture } from "../core/checkWorkspace";
import { repositoryArchitectureOptions } from "../repository/repositoryPolicy";
import { createWorkspaceFixture, manifest, ofKind } from "./checkWorkspace.fixture";

const { createWorkspace } = createWorkspaceFixture();
const REPOSITORY_ROOT = resolve(import.meta.dir, "../../..");
const CONTROL_COLLECTION = resolve(REPOSITORY_ROOT, "packages/official-repository/collections/ulvia-official");
const BINARY_FILE_TRANSPORTS = new Set(["/.cms/files/upload", "/.cms/files/content"]);

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
            exports: { "./bindings": "./src/bindings.ts" },
        }),
        "packages/features/content/src/bindings.ts": "export const optimize = () => import('sharp');",
    });
    expect(ofKind(await checkWorkspaceArchitecture({ rootDir: root }), "browser-runtime-adapter")).toHaveLength(1);
});

test("official Control management flows use capability calls", async () => {
    const browserSources = await controlFiles("blocs/control/**/*.ts");
    for (const path of browserSources) {
        const source = await readFile(path, "utf8");
        for (const match of source.matchAll(/fetch\s*\(\s*[`'"]([^`'"]+)/gu)) {
            expect(match[1], path).toStartWith("/.cms/call/");
        }
    }

    const pages = await controlFiles("pages/control/**/*.html");
    for (const path of pages) {
        const source = await readFile(path, "utf8");
        for (const match of source.matchAll(/\bcms-source="([^"]+)"/gu)) {
            const endpoint = match[1]!.split(" as ", 1)[0]!;
            expect(
                endpoint.startsWith("/.cms/call/") || BINARY_FILE_TRANSPORTS.has(endpoint),
                `${path}: ${endpoint}`,
            ).toBeTrue();
        }
    }
});

async function controlFiles(pattern: string): Promise<string[]> {
    const paths: string[] = [];
    for await (const path of new Bun.Glob(pattern).scan({ cwd: CONTROL_COLLECTION, absolute: true })) {
        paths.push(path);
    }
    return paths.sort();
}
