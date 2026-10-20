import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCollectionBloc } from "@bernouy/cms-repository/collections/build";
import { assertValidJavaScriptArtifact, runBuild } from "../../../../src/collections/tooling/buildFiles";

describe("buildCollectionBloc output", () => {
    test("rejects an invalid collection Bloc tag at the public build boundary", async () => {
        await expect(
            buildCollectionBloc({ tag: "../invalid", viewSource: "export function mount() {}" }),
        ).rejects.toThrow('Invalid collection Bloc tag "../invalid"');
    });

    test("rejects native HTML tags before building browser bundles", async () => {
        await expect(buildCollectionBloc({ tag: "img", viewSource: "export function mount() {}" })).rejects.toThrow(
            'Invalid collection Bloc tag "img"',
        );
    });

    test("minifies the browser view bundle", async () => {
        const artifact = await buildCollectionBloc({
            tag: "demo-minified",
            viewSource: [
                "// VIEW_COMMENT_TO_REMOVE",
                'export function mount(root) { root.toggleAttribute("mounted", true); }',
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
                `import fragment from "./fragment.html" with { type: "text" };`,
                `import css from "./style.css" with { type: "text" };`,
                `export function mount(root) { root.dataset.fragment = fragment; root.dataset.css = css; }`,
            ].join("\n"),
            source: {
                "fragment.html": Buffer.from("<p>Separated fragment</p>").toString("base64"),
                "style.css": Buffer.from(":scope { display: block; }").toString("base64"),
            },
        });

        expect(artifact.viewJS).toContain("Separated fragment");
        expect(artifact.viewJS).toContain("display: block");
    });

    test("resolves imports from a nested declared view path", async () => {
        const artifact = await buildCollectionBloc({
            tag: "demo-nested",
            viewSource: [
                `import { label } from "../label";`,
                `export function mount(root) { root.dataset.label = label; }`,
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
                viewSource: "export function mount() {}",
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
                        "export function mount() { return marker; }",
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
                viewSource: `import { readFile } from "node:fs/promises"; export function mount() { return readFile; }`,
            }),
        ).rejects.toThrow("Bloc imports may only use bundled relative sources or approved host APIs");
    });

    test("registers an exported Light DOM mount function", async () => {
        const artifact = await buildCollectionBloc({
            tag: "demo-component",
            viewSource: `export function mount(root) { root.toggleAttribute("mounted", true); }`,
        });
        expect(artifact.viewJS).toContain("window.cmsRuntime.registerBloc");
        expect(artifact.viewJS).toContain("demo-component");
        expect(artifact.browserAbi).toBe("v1");

        const definitions = new Map<string, { mount?: (root: HTMLElement) => void }>();
        const cmsRuntime = {
            registerBloc: (id: string, definition: { mount?: (root: HTMLElement) => void }, abi: string) => {
                expect(abi).toBe("v1");
                definitions.set(id, definition);
            },
        };
        new Function("window", artifact.viewJS)({ cmsRuntime });
        const attributes = new Set<string>();
        const root = {
            toggleAttribute: (name: string, force: boolean) => (force ? attributes.add(name) : attributes.delete(name)),
        } as unknown as HTMLElement;
        definitions.get("demo-component")?.mount?.(root);
        expect(attributes.has("mounted")).toBe(true);
    });

    test("rejects legacy self-registering custom elements", async () => {
        await expect(
            buildCollectionBloc({
                tag: "legacy-card",
                viewSource: "customElements.define('legacy-card', class extends HTMLElement {});",
            }),
        ).rejects.toThrow("customElements.define");
    });

    test("reports Bun build failures and missing outputs", async () => {
        await expect(
            buildCollectionBloc({
                tag: "demo-card",
                viewSource: "import './missing.js'; export function mount() {}",
            }),
        ).rejects.toThrow(/Build failed \(view bundle for demo-card\):/);
        const build = async () => ({ success: true, outputs: [], logs: [] }) as unknown as Bun.BuildOutput;
        await expect(runBuild({ entrypoints: ["demo-card.js"] }, "view bundle for demo-card", build)).rejects.toThrow(
            /Build failed \(view bundle for demo-card\):\n  \(no details from Bun.build\)/,
        );
    });
});
