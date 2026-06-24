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
                "manifest.json": encode(JSON.stringify({
                    "default-tag": "site-demo",
                    bloc: "./Bloc.ts",
                    editor: "./BlocEditor.ts",
                    meta: { title: "Demo", description: "Demo bloc" },
                }, null, 4) + "\n"),
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
        expect(list).toEqual([{ id: "site-demo", name: "Demo", group: "Layout", description: "Demo bloc" }]);
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
                "manifest.json": encode(JSON.stringify({
                    "default-tag": "site-demo",
                    bloc: "./Bloc.ts",
                    editor: "./BlocEditor.ts",
                    meta: { title: "Demo", description: "Demo bloc" },
                }, null, 4) + "\n"),
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
                "manifest.json": encode(JSON.stringify({
                    "default-tag": "site-demo",
                    bloc: "./Bloc.ts",
                    editor: "./BlocEditor.ts",
                    meta: { title: "Demo", description: "Demo bloc" },
                }, null, 4) + "\n"),
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
});

describe("LocalFsCmsRepository system settings", () => {
    test("persists runtime email settings in system.json", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-dev-repo-"));
        const repository = new LocalFsCmsRepository(siteDir, new Map());

        await repository.updateSystem({
            email: {
                enabled:   true,
                fromEmail: "no-reply@example.com",
                fromName:  "CMS",
                replyTo:   "support@example.com",
                transport: "smtp",
                smtp:      {
                    host:              "smtp.example.com",
                    port:              587,
                    secure:            false,
                    username:          "postmaster@example.com",
                    passwordSecretRef: "${SMTP_PASSWORD}",
                },
            },
        });

        const reloaded = new LocalFsCmsRepository(siteDir, new Map());
        const system = await reloaded.getSystem();
        const raw = await readFile(join(siteDir, "system.json"), "utf-8");

        expect(system.email.smtp.host).toBe("smtp.example.com");
        expect(system.email.smtp.passwordSecretRef).toBe("${SMTP_PASSWORD}");
        expect(JSON.parse(raw).email.enabled).toBe(true);
    });
});
