import { describe, expect, test } from "bun:test";
import { checkWorkspaceArchitecture } from "../core/checkWorkspace";
import { createWorkspaceFixture, manifest, ofKind } from "./checkWorkspace.fixture";

const { createWorkspace } = createWorkspaceFixture();

describe("browser adapter boundaries", () => {
    test("allows feature handlers in surfaces while keeping transport adapters in runtimes", async () => {
        const root = await createWorkspace({
            "packages/features/content/package.json": manifest("@bernouy/cms-content", {
                exports: { "./http": "./src/http.ts" },
            }),
            "packages/features/seo/package.json": manifest("@bernouy/cms-seo", {
                exports: { "./http": "./src/http.ts" },
            }),
            "packages/features/gateway/package.json": manifest("@bernouy/cms-gateway", {
                exports: {
                    ".": "./src/index.ts",
                    "./http": "./src/http.ts",
                    "./http/handlers": "./src/handlers.ts",
                    "./http/node": "./src/node.ts",
                },
            }),
            "packages/features/gateway/src/index.ts": "export const gateway = true;",
            "packages/features/gateway/src/http.ts": "export const transport = true;",
            "packages/features/gateway/src/handlers.ts": "export const handlers = true;",
            "packages/features/gateway/src/node.ts": "export const network = true;",
            "packages/surfaces/web/package.json": manifest("@fixture/web", {
                dependencies: {
                    "@bernouy/cms-content": "workspace:*",
                    "@bernouy/cms-gateway": "workspace:*",
                    "@bernouy/cms-seo": "workspace:*",
                },
                exports: { ".": "./src/index.ts", "./browser": "./src/browser.ts" },
            }),
            "packages/surfaces/web/src/index.ts": [
                "import '@bernouy/cms-gateway/http/handlers';",
                "import '@bernouy/cms-gateway/http';",
                "import '@bernouy/cms-gateway/http/node';",
                "import '@bernouy/cms-content/http';",
                "import '@bernouy/cms-seo/http';",
            ].join("\n"),
            "packages/surfaces/web/src/browser.ts": "export const browser = true;",
        });
        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        const surface = ofKind(violations, "surface-runtime-adapter");
        expect(surface).toHaveLength(2);
        expect(surface.some((item) => item.message.endsWith("@bernouy/cms-gateway/http"))).toBe(true);
        expect(surface.some((item) => item.message.endsWith("@bernouy/cms-gateway/http/node"))).toBe(true);
        expect(ofKind(violations, "browser-runtime-adapter")).toHaveLength(0);
    });

    test("allows feature HTTP handlers in surfaces but keeps transports and browser imports restricted", async () => {
        const root = await createWorkspace({
            "packages/features/content/package.json": manifest("@bernouy/cms-content", {
                exports: {
                    ".": "./src/index.ts",
                    "./http": "./src/http.ts",
                    "./smtp": "./src/smtp.ts",
                    "./browser": "./src/browser.ts",
                },
            }),
            "packages/features/content/src/index.ts": "export const content = true;",
            "packages/features/content/src/http.ts": "export const routes = true;",
            "packages/features/content/src/smtp.ts": "export const smtp = true;",
            "packages/features/content/src/browser.ts": [
                "import '@bernouy/cms-content/http';",
                "import '@bernouy/cms-content/smtp';",
            ].join("\n"),
            "packages/surfaces/web/package.json": manifest("@fixture/web", {
                dependencies: { "@bernouy/cms-content": "workspace:*" },
                exports: { ".": "./src/index.ts" },
            }),
            "packages/surfaces/web/src/index.ts": [
                "import '@bernouy/cms-content/http';",
                "import '@bernouy/cms-content/smtp';",
                "import 'nodemailer';",
            ].join("\n"),
        });
        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        const surface = ofKind(violations, "surface-runtime-adapter");
        expect(surface).toHaveLength(2);
        expect(surface.some((item) => item.message.endsWith("@bernouy/cms-content/smtp"))).toBe(true);
        expect(surface.some((item) => item.message.endsWith("nodemailer"))).toBe(true);
        const browser = ofKind(violations, "browser-runtime-adapter");
        expect(browser).toHaveLength(2);
        expect(browser.some((item) => item.message.endsWith("@bernouy/cms-content/http"))).toBe(true);
    });

    test("reports runtime adapters in surfaces and transitive browser exports", async () => {
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
            "packages/features/cms-auth/tsconfig.json": `${JSON.stringify(
                {
                    compilerOptions: { baseUrl: "./src", paths: { "cms-auth/*": ["./*"] } },
                },
                null,
                2,
            )}\n`,
            "packages/features/cms-auth/src/exports/index.ts": "export const auth = true;\n",
            "packages/features/cms-auth/src/exports/components.ts": "export { unsafe } from 'cms-auth/core/unsafe';\n",
            "packages/features/cms-auth/src/core/unsafe.ts": [
                "import { readFile } from 'node:fs';",
                "export const unsafe = readFile;",
                "",
            ].join("\n"),
        });
        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "browser-runtime-adapter")).toHaveLength(1);
        expect(ofKind(violations, "browser-runtime-adapter")[0]!.file).toMatch(/core\/unsafe\.ts$/);
    });

    test("treats a components root as browser code for generated targets", async () => {
        const root = await createWorkspace({
            "packages/foundation/browser-components/package.json": manifest("@fixture/components", {
                exports: { ".": "./dist/index.js" },
            }),
            "packages/foundation/browser-components/src/index.ts": "export { unsafe } from './unsafe';\n",
            "packages/foundation/browser-components/src/unsafe.ts": [
                "import { readFile } from 'fs/promises';",
                "export const unsafe = readFile;",
                "",
            ].join("\n"),
        });
        const violations = await checkWorkspaceArchitecture({ rootDir: root });
        expect(ofKind(violations, "browser-runtime-adapter")).toHaveLength(1);
        expect(ofKind(violations, "browser-runtime-adapter")[0]!.file).toMatch(/browser-components\/src\/unsafe\.ts$/);
    });
});
