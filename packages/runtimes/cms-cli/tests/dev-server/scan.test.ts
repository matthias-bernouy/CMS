import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanDevBlocs } from "cms-cli/dev-server/scan";

function makeBlocsRoot(layout: Record<string, Record<string, string>>): string {
    const root = mkdtempSync(join(tmpdir(), "p9r-blocs-"));
    const blocs = join(root, "blocs");
    mkdirSync(blocs);
    for (const [folder, files] of Object.entries(layout)) {
        const dir = join(blocs, folder);
        mkdirSync(dir, { recursive: true });
        for (const [name, content] of Object.entries(files)) {
            writeFileSync(join(dir, name), content);
        }
    }
    return blocs;
}

const baseManifest = (tag: string) =>
    JSON.stringify({
        "default-tag": tag,
        bloc: "./Bloc.ts",
        meta: { title: "T", description: "" },
    });

describe("scanDevBlocs", () => {
    test("derives group from the parent folder name", async () => {
        const root = makeBlocsRoot({
            "marketing/cta-v1": { "manifest.json": baseManifest("cta-v1"), "Bloc.ts": "" },
            "_uncategorized/footer": { "manifest.json": baseManifest("footer"), "Bloc.ts": "" },
        });
        const blocs = await scanDevBlocs(root, { quiet: true });
        const byTag = Object.fromEntries(blocs.map((b) => [b.tag, b]));
        expect(byTag["cta-v1"]?.group).toBe("marketing");
        expect(byTag["footer"]?.group).toBe(""); // _uncategorized → empty
    });

    test("skips loose blocs at the root of blocs/", async () => {
        const root = makeBlocsRoot({
            "loose-bloc": { "manifest.json": baseManifest("loose-bloc"), "Bloc.ts": "" },
        });
        const blocs = await scanDevBlocs(root, { quiet: true });
        expect(blocs).toHaveLength(0);
    });

    test("rejects manifest.json containing default-group", async () => {
        const manifest = JSON.stringify({
            "default-tag": "invalid",
            "default-group": "Old",
            bloc: "./Bloc.ts",
        });
        const root = makeBlocsRoot({
            "marketing/invalid": { "manifest.json": manifest, "Bloc.ts": "" },
        });
        const blocs = await scanDevBlocs(root, { quiet: true });
        // parseManifest swallows the throw and warns; the bloc is dropped.
        expect(blocs).toHaveLength(0);
    });

    test("rejects manifest entries that escape their bloc folder", async () => {
        const root = makeBlocsRoot({
            "marketing/demo-card": {
                "manifest.json": JSON.stringify({
                    "default-tag": "demo-card",
                    bloc: "../../../outside.ts",
                }),
            },
        });

        await expect(scanDevBlocs(root, { quiet: true })).rejects.toThrow("escapes the site directory");
    });

    test("treats builder.json as authoritative and rejects an invalid schema in strict mode", async () => {
        const root = makeBlocsRoot({
            "Layout/site-shell": {
                "builder.json": JSON.stringify({ schema: "not-a-site-bloc" }),
                "manifest.json": baseManifest("site-shell"),
                "Bloc.ts": "export class Untrusted extends HTMLElement {}",
            },
        });

        await expect(scanDevBlocs(root, { quiet: true, strictBuilder: true })).rejects.toThrow(
            'schema must be "cms.site-bloc.v1"',
        );
    });

    test("continues scanning nested bloc folders after a parent manifest", async () => {
        const root = makeBlocsRoot({
            "ui/accordion": { "manifest.json": baseManifest("base-accordion"), "Bloc.ts": "" },
            "ui/accordion/item": { "manifest.json": baseManifest("base-accordion-item"), "Bloc.ts": "" },
        });
        const blocs = await scanDevBlocs(root, { quiet: true });
        const tags = blocs.map((b) => b.tag).sort();
        expect(tags).toEqual(["base-accordion", "base-accordion-item"]);
    });

    test("accepts native editor-only blocs without manifest runtime metadata or a view entry", async () => {
        const root = makeBlocsRoot({
            "Text/paragraph": {
                "manifest.json": JSON.stringify({
                    "default-tag": "p",
                    editor: "./BlocEditor.ts",
                    meta: { title: "Paragraph", description: "" },
                }),
                "BlocEditor.ts": "",
            },
        });
        const blocs = await scanDevBlocs(root, { quiet: true });
        expect(blocs).toHaveLength(1);
        expect(blocs[0]?.tag).toBe("p");
        expect(blocs[0]?.entry).toBeUndefined();
        expect(blocs[0]?.editorEntry).toContain("BlocEditor.ts");
    });
});
