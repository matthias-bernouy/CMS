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

const baseManifest = (tag: string) => JSON.stringify({
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
        const byTag = Object.fromEntries(blocs.map(b => [b.tag, b]));
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
        const legacy = JSON.stringify({
            "default-tag": "legacy", "default-group": "Old", bloc: "./Bloc.ts",
        });
        const root = makeBlocsRoot({
            "marketing/legacy": { "manifest.json": legacy, "Bloc.ts": "" },
        });
        const blocs = await scanDevBlocs(root, { quiet: true });
        // parseManifest swallows the throw and warns; the bloc is dropped.
        expect(blocs).toHaveLength(0);
    });
});
