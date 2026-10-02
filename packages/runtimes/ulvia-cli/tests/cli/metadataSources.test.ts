import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadCollectionTheme, loadCollectionTranslations } from "../../src/release/metadataSources";

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(
        temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

test("translation locale directories merge recursive JSON fragments", async () => {
    const root = await temporaryDirectory();
    await writeJson(join(root, "en", "collection.json"), { "collection.name": "Example" });
    await writeJson(join(root, "en", "theme", "tokens.json"), { "theme.token.primary.label": "Primary" });
    await writeJson(join(root, "fr", "collection.json"), { "collection.name": "Exemple" });

    expect(await loadCollectionTranslations(root)).toEqual({
        en: { "collection.name": "Example", "theme.token.primary.label": "Primary" },
        fr: { "collection.name": "Exemple" },
    });
});

test("translation fragments reject duplicate keys and locale files at the root", async () => {
    const duplicateRoot = await temporaryDirectory();
    await writeJson(join(duplicateRoot, "en", "one.json"), { "collection.name": "One" });
    await writeJson(join(duplicateRoot, "en", "nested", "two.json"), { "collection.name": "Two" });
    await expect(loadCollectionTranslations(duplicateRoot)).rejects.toThrow("declared by both");

    const flatRoot = await temporaryDirectory();
    await writeJson(join(flatRoot, "en.json"), { "collection.name": "Example" });
    await expect(loadCollectionTranslations(flatRoot)).rejects.toThrow("en.json must be a locale directory");
});

test("theme categories are discovered recursively but retain manifest order", async () => {
    const root = await temporaryDirectory();
    await writeJson(join(root, "definition.json"), {
        label: "theme.label",
        categories: ["colors", "spacing"],
    });
    await writeJson(join(root, "foundations", "spacing.json"), category("spacing"));
    await writeJson(join(root, "visual", "colors.json"), category("colors"));

    expect(await loadCollectionTheme(root)).toEqual({
        label: "theme.label",
        categories: [category("colors"), category("spacing")],
    });
});

test("theme discovery rejects orphan and ambiguously named category files", async () => {
    const orphanRoot = await temporaryDirectory();
    await writeJson(join(orphanRoot, "definition.json"), { label: "theme.label", categories: ["colors"] });
    await writeJson(join(orphanRoot, "visual", "colors.json"), category("colors"));
    await writeJson(join(orphanRoot, "visual", "spacing.json"), category("spacing"));
    await expect(loadCollectionTheme(orphanRoot)).rejects.toThrow("must exactly match");

    const misnamedRoot = await temporaryDirectory();
    await writeJson(join(misnamedRoot, "definition.json"), { label: "theme.label", categories: ["colors"] });
    await writeJson(join(misnamedRoot, "visual", "palette.json"), category("colors"));
    await expect(loadCollectionTheme(misnamedRoot)).rejects.toThrow("must be named after its string id");
});

function category(id: string) {
    return { id, label: `theme.category.${id}.label`, tokens: [] };
}

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "ulvia-metadata-sources-"));
    temporaryDirectories.push(directory);
    return directory;
}

async function writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, JSON.stringify(value));
}
