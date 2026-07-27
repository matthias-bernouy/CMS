import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsCmsRepository } from "cms-cli/dev-server/repo/LocalFsCmsRepository";

function encode(value: string): string {
    return Buffer.from(value, "utf-8").toString("base64");
}

describe("LocalFsCmsRepository blocs", () => {
    test("createBloc writes an editable source folder and updates the dev registry", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-dev-repo-"));
        const repository = new LocalFsCmsRepository(siteDir, new Map());

        await repository.createBloc({
            id: "site-demo",
            name: "Demo",
            group: "Layout",
            description: "Demo bloc",
            viewJS: "",
            editorJS: "",
            source: {
                "manifest.json": encode(
                    JSON.stringify(
                        {
                            "default-tag": "site-demo",
                            bloc: "./Bloc.ts",
                            editor: "./BlocEditor.ts",
                            meta: { title: "Demo", description: "Demo bloc" },
                        },
                        null,
                        4,
                    ) + "\n",
                ),
                "Bloc.ts": encode("export class DemoBloc extends HTMLElement {}\n"),
                "BlocEditor.ts": encode(`
                    import { Editor } from "@bernouy/cms-control/editor";
                    export class DemoEditor extends Editor {}
                `),
            },
        });

        const manifest = await readFile(join(siteDir, "blocs", "Layout", "site-demo", "manifest.json"), "utf-8");
        expect(manifest).toContain(`"default-tag": "site-demo"`);

        const viewJS = await repository.getBlocViewJS("site-demo");
        expect(viewJS).toContain(`customElements.define("site-demo"`);

        const list = await repository.getBlocsList();
        expect(list).toEqual([
            {
                id: "site-demo",
                name: "Demo",
                group: "Layout",
                description: "Demo bloc",
                ownership: { kind: "code-managed" },
            },
        ]);
    });

    test("replaceBloc removes stale source files", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-dev-repo-"));
        const repository = new LocalFsCmsRepository(siteDir, new Map());

        await repository.createBloc({
            id: "site-demo",
            name: "Demo",
            group: "Layout",
            description: "Demo bloc",
            viewJS: "",
            editorJS: "",
            source: {
                "manifest.json": encode(
                    JSON.stringify(
                        {
                            "default-tag": "site-demo",
                            bloc: "./Bloc.ts",
                            editor: "./BlocEditor.ts",
                            meta: { title: "Demo", description: "Demo bloc" },
                        },
                        null,
                        4,
                    ) + "\n",
                ),
                "Bloc.ts": encode("export class DemoBloc extends HTMLElement {}\n"),
                "BlocEditor.ts": encode(`
                    import { Editor } from "@bernouy/cms-control/editor";
                    export class DemoEditor extends Editor {}
                `),
                "old.css": encode(":host { display: block; }\n"),
            },
        });

        await repository.replaceBloc({
            id: "site-demo",
            name: "Demo",
            group: "Layout",
            description: "Demo bloc",
            viewJS: "",
            editorJS: "",
            source: {
                "manifest.json": encode(
                    JSON.stringify(
                        {
                            "default-tag": "site-demo",
                            bloc: "./Bloc.ts",
                            editor: "./BlocEditor.ts",
                            meta: { title: "Demo", description: "Demo bloc" },
                        },
                        null,
                        4,
                    ) + "\n",
                ),
                "Bloc.ts": encode("export class DemoBloc extends HTMLElement {}\n"),
                "BlocEditor.ts": encode(`
                    import { Editor } from "@bernouy/cms-control/editor";
                    export class DemoEditor extends Editor {}
                `),
            },
        });

        const source = await repository.getBlocSource("site-demo");
        expect(source?.["old.css"]).toBeUndefined();
    });

    test("can write blocs under a generated root", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-dev-repo-"));
        const repository = new LocalFsCmsRepository(siteDir, new Map(), {
            blocRootDir: ".p9r/generated/blocs",
        });

        await repository.createBloc({
            id: "generated-demo",
            name: "Generated Demo",
            group: "Integrations",
            description: "Generated bloc",
            viewJS: "",
            editorJS: "",
            source: {
                "manifest.json": encode(
                    JSON.stringify(
                        {
                            "default-tag": "generated-demo",
                            bloc: "./Bloc.ts",
                            editor: "./BlocEditor.ts",
                            meta: { title: "Generated Demo", description: "Generated bloc" },
                        },
                        null,
                        4,
                    ) + "\n",
                ),
                "Bloc.ts": encode("export class GeneratedDemoBloc extends HTMLElement {}\n"),
                "BlocEditor.ts": encode(`
                    import { Editor } from "@bernouy/cms-control/editor";
                    export class GeneratedDemoEditor extends Editor {}
                `),
            },
        });

        const manifest = await readFile(
            join(siteDir, ".p9r", "generated", "blocs", "Integrations", "generated-demo", "manifest.json"),
            "utf-8",
        );
        expect(manifest).toContain(`"default-tag": "generated-demo"`);
        expect(await repository.getBlocViewJS("generated-demo")).toContain(`customElements.define("generated-demo"`);
    });
});
