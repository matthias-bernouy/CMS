import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCollectionBloc } from "@bernouy/cms-repository/collections/build";
import { assertValidJavaScriptArtifact, runBuild } from "../../../../src/collections/tooling/buildFiles";

describe("buildCollectionBloc output", () => {
    test("rejects an invalid collection Bloc tag at the public build boundary", async () => {
        await expect(buildCollectionBloc({ tag: "../invalid", viewSource: "export class Bloc {}" })).rejects.toThrow(
            'Invalid collection Bloc tag "../invalid"',
        );
    });

    test("rejects native HTML tags before building browser bundles", async () => {
        await expect(buildCollectionBloc({ tag: "img", viewSource: "export class Bloc {}" })).rejects.toThrow(
            'Invalid collection Bloc tag "img"',
        );
    });

    test("minifies the browser view bundle", async () => {
        const artifact = await buildCollectionBloc({
            tag: "demo-minified",
            viewSource: [
                "// VIEW_COMMENT_TO_REMOVE",
                "customElements.define('demo-minified', class extends HTMLElement {});",
            ].join("\n"),
        });

        expect(artifact.viewJS).not.toContain("VIEW_COMMENT_TO_REMOVE");
        expect(() => new Function(artifact.viewJS)).not.toThrow();
    });

    test("rejects invalid final JavaScript with an actionable artifact label", () => {
        expect(() => assertValidJavaScriptArtifact("try {", "view bundle for broken-card")).toThrow(
            /Invalid generated JavaScript \(view bundle for broken-card\):.*Check the Bloc source and manifest metadata; the artifact was not persisted\./,
        );
    });

    test("materializes bundled source files used by view imports", async () => {
        const artifact = await buildCollectionBloc({
            tag: "demo-separated",
            viewSource: [
                `import template from "./template.html" with { type: "text" };`,
                `import css from "./style.css" with { type: "text" };`,
                `customElements.define("demo-separated", class extends HTMLElement { static template = template; static css = css; });`,
            ].join("\n"),
            source: {
                "template.html": Buffer.from("<p>Separated template</p>").toString("base64"),
                "style.css": Buffer.from(":host { display: block; }").toString("base64"),
            },
        });

        expect(artifact.viewJS).toContain("Separated template");
        expect(artifact.viewJS).toContain("display: block");
    });

    test("resolves imports from a nested declared view path", async () => {
        const artifact = await buildCollectionBloc({
            tag: "demo-nested",
            viewSource: [
                `import { label } from "../label";`,
                `customElements.define("BE5_TAG_TO_BE_REPLACED", class extends HTMLElement { label = label; });`,
            ].join("\n"),
            source: { "label.ts": Buffer.from(`export const label = "Nested";`).toString("base64") },
            viewPath: "controller/bloc.ts",
        });

        expect(artifact.viewJS).toContain("Nested");
    });

    test("rejects source paths escaping the temporary bundle", async () => {
        await expect(
            buildCollectionBloc({
                tag: "demo-card",
                viewSource: "export class Bloc {}",
                source: { "../outside.js": Buffer.from("unsafe").toString("base64") },
            }),
        ).rejects.toThrow("Invalid collection Bloc source path: ../outside.js");
    });

    test("rejects imports that resolve outside the uploaded source bundle", async () => {
        const outsideDir = await mkdtemp(join(tmpdir(), "cms-bloc-outside-"));
        const outsidePath = join(outsideDir, "outside.ts");
        await Bun.write(outsidePath, 'export const marker = "OUTSIDE_BUNDLE";');
        try {
            await expect(
                buildCollectionBloc({
                    tag: "demo-outside",
                    viewSource: [
                        `import { marker } from ${JSON.stringify(outsidePath)};`,
                        "export class Bloc { static marker = marker; }",
                    ].join("\n"),
                }),
            ).rejects.toThrow();
        } finally {
            await rm(outsideDir, { recursive: true, force: true });
        }
    });

    test("rejects undeclared host package imports", async () => {
        await expect(
            buildCollectionBloc({
                tag: "demo-unsafe-package",
                viewSource: `import { readFile } from "node:fs/promises"; export class Bloc { static readFile = readFile; }`,
            }),
        ).rejects.toThrow("Bloc imports may only use bundled relative sources or approved host APIs");
    });

    test("exposes the Component base and registers an exported view", async () => {
        const artifact = await buildCollectionBloc({
            tag: "demo-component",
            viewSource: [
                `import { Component } from "@bernouy/cms-content/browser";`,
                `export class DemoComponent extends Component { constructor() { super({ template: "<slot></slot>" }); } }`,
            ].join("\n"),
        });
        expect(artifact.viewJS).toContain("window.cmsRuntime.Component");
        expect(artifact.viewJS).toContain("demo-component");

        const definitions = new Map<string, unknown>();
        const customElements = {
            define: (tag: string, constructor: unknown) => definitions.set(tag, constructor),
            get: (tag: string) => definitions.get(tag),
        };
        new Function("window", "customElements", "HTMLElement", artifact.viewJS)(
            { cmsRuntime: { Component: class {} } },
            customElements,
            class {},
        );
        expect(definitions.get("demo-component")).toBeFunction();
    });

    test("keeps a legacy self-registering view from registering twice", async () => {
        const artifact = await buildCollectionBloc({
            tag: "legacy-card",
            viewSource: "customElements.define('legacy-card', class extends HTMLElement {});",
        });
        const definitions = new Map<string, unknown>();
        let registrations = 0;
        const customElements = {
            define: (tag: string, constructor: unknown) => {
                registrations++;
                definitions.set(tag, constructor);
            },
            get: (tag: string) => definitions.get(tag),
        };
        new Function("customElements", "HTMLElement", artifact.viewJS)(customElements, class {});
        expect(registrations).toBe(1);
        expect(definitions.get("legacy-card")).toBeFunction();
    });

    test("reports Bun build failures and missing outputs", async () => {
        await expect(buildCollectionBloc({ tag: "demo-card", viewSource: "import './missing.js';" })).rejects.toThrow(
            /Build failed \(view bundle for demo-card\):/,
        );
        const build = async () => ({ success: true, outputs: [], logs: [] }) as unknown as Bun.BuildOutput;
        await expect(runBuild({ entrypoints: ["demo-card.js"] }, "view bundle for demo-card", build)).rejects.toThrow(
            /Build failed \(view bundle for demo-card\):\n  \(no details from Bun.build\)/,
        );
    });
});
