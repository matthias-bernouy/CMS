import { expect, test } from "bun:test";
import { prepareResourceSource, buildResourceArchive } from "@bernouy/resources/build";
import { sourceFixture } from "./fixtures";

test("ordinary source builds are deterministic, localized and independent of later file edits or authored module execution", async () => {
    const f = await sourceFixture();
    try {
        const source = await prepareResourceSource(f.root, []);
        await f.write(f.folder + "markup.html", "<script>invalid later edit</script>");
        const first = await buildResourceArchive([source], { locale: "en", contracts: [] });
        const same = await buildResourceArchive([source], { locale: "en", contracts: [] });
        const french = await buildResourceArchive([source], { locale: "fr-CA", contracts: [] });
        expect(first.digest).toBe(same.digest);
        expect(french.digest).not.toBe(first.digest);
        expect(french.document.pages[0]!.title).toBe("Accueil");
        expect(french.document.blocs[0]!.name).toBe("Carte");
        expect(first.document.blocs[0]!.viewJS).toContain("AUTHORED MODULE MUST NOT EXECUTE");
        expect(first.document.blocs[0]!.markupHTML).toBe("<slot></slot>");
        expect(await first.assets[0]!.bytes.text()).toBe("Hello");
        expect(Object.isFrozen(source)).toBe(true);
        expect(Object.isFrozen(source.blocs)).toBe(true);
        await expect(buildResourceArchive([source, source], { locale: "en", contracts: [] })).rejects.toThrow("unique");
    } finally {
        await f.close();
    }
});

test("source imports cannot escape their captured module boundary", async () => {
    const f = await sourceFixture();
    try {
        await f.write(
            f.folder + "bloc.ts",
            'import { value } from "../outside.ts"; export function mount() { return value; }',
        );
        await expect(prepareResourceSource(f.root, [])).rejects.toThrow("escapes");
    } finally {
        await f.close();
    }
});

test("source-only files cannot be silently ignored by a Bloc build", async () => {
    const f = await sourceFixture();
    try {
        await f.write(f.folder + "extra.html", "ignored?");
        await expect(prepareResourceSource(f.root, [])).rejects.toThrow("Unknown resource Bloc source");
    } finally {
        await f.close();
    }
});

test("source metadata keeps the existing UTF-16 string budget", async () => {
    const f = await sourceFixture();
    try {
        const valid = {
            "card.name": "Card",
            "card.description": "😀".repeat(2048),
            "group.base": "Base",
            "page.title": "Home",
            "page.description": "Home page",
        };
        await f.write("translations/en/base.json", valid);
        expect((await prepareResourceSource(f.root, [])).translations.en!["card.description"]!.length).toBe(4096);
        await f.write("translations/en/base.json", { ...valid, "card.description": "😀".repeat(2049) });
        await expect(prepareResourceSource(f.root, [])).rejects.toThrow();
    } finally {
        await f.close();
    }
});
