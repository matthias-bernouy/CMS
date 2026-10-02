import { afterEach, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadCollectionBlocs } from "../../src/release/blocSources";
import { loadCollectionTexts } from "../../src/release/textSources";

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(
        temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

test("text definitions and locale values merge recursively without path-derived identity", async () => {
    const root = await temporaryDirectory();
    await writeJson(join(root, "definitions", "storefront", "welcome.json"), [
        { id: "title", label: "text.title.label" },
    ]);
    await writeJson(join(root, "definitions", "support", "faq.json"), [
        { id: "question", label: "text.question.label" },
    ]);
    await writeJson(join(root, "locales", "en", "storefront", "welcome.json"), { title: "Welcome" });
    await writeJson(join(root, "locales", "en", "support", "faq.json"), { question: "Why?" });
    await writeJson(join(root, "locales", "fr", "storefront", "welcome.json"), { title: "Bienvenue" });

    expect(await loadCollectionTexts(root)).toEqual([
        { id: "question", label: "text.question.label", values: { en: "Why?" } },
        { id: "title", label: "text.title.label", values: { en: "Welcome", fr: "Bienvenue" } },
    ]);
});

test("text sources reject duplicate definitions, duplicate values and unknown IDs", async () => {
    const definitionsRoot = await temporaryDirectory();
    await writeJson(join(definitionsRoot, "definitions", "one.json"), [{ id: "title" }]);
    await writeJson(join(definitionsRoot, "definitions", "nested", "two.json"), [{ id: "title" }]);
    await mkdir(join(definitionsRoot, "locales"));
    await expect(loadCollectionTexts(definitionsRoot)).rejects.toThrow("is declared by both");

    const valuesRoot = await temporaryDirectory();
    await writeJson(join(valuesRoot, "definitions", "texts.json"), [{ id: "title" }]);
    await writeJson(join(valuesRoot, "locales", "en", "one.json"), { title: "One" });
    await writeJson(join(valuesRoot, "locales", "en", "nested", "two.json"), { title: "Two" });
    await expect(loadCollectionTexts(valuesRoot)).rejects.toThrow("is declared by both");

    const unknownRoot = await temporaryDirectory();
    await writeJson(join(unknownRoot, "definitions", "texts.json"), [{ id: "title" }]);
    await writeJson(join(unknownRoot, "locales", "en", "texts.json"), { unknown: "No" });
    await expect(loadCollectionTexts(unknownRoot)).rejects.toThrow("defines unknown text");
});

test("Bloc folders are discovered recursively while their IDs remain folder-owned", async () => {
    const root = await temporaryDirectory();
    await writeComposition(join(root, "content", "nested", "example-welcome"), "example-welcome");
    await writeComposition(join(root, "layout", "example-footer"), "example-footer");

    const blocs = (await loadCollectionBlocs(root, "Example")) as { id: string; lightdom: string }[];
    expect(blocs.map((bloc) => bloc.id)).toEqual(["example-footer", "example-welcome"]);
    expect(blocs[1]!.lightdom).toBe("<p>example-welcome</p>");
});

test("Bloc discovery rejects duplicate IDs and files in grouping directories", async () => {
    const duplicateRoot = await temporaryDirectory();
    await writeComposition(join(duplicateRoot, "one", "example-card"), "example-card");
    await writeComposition(join(duplicateRoot, "two", "example-card"), "example-card");
    await expect(loadCollectionBlocs(duplicateRoot, "Example")).rejects.toThrow("is declared by both");

    const orphanRoot = await temporaryDirectory();
    await Bun.write(join(orphanRoot, "README.md"), "orphan");
    await expect(loadCollectionBlocs(orphanRoot, "Example")).rejects.toThrow(
        "Bloc grouping directories may not contain files",
    );
});

async function writeComposition(root: string, id: string): Promise<void> {
    await writeJson(join(root, "definition.json"), {
        id,
        kind: "composition",
        label: `bloc.${id}.label`,
        uses: [],
        requires: [],
        slots: {},
    });
    await Bun.write(join(root, "lightdom.html"), `<p>${id}</p>`);
}

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "ulvia-content-sources-"));
    temporaryDirectories.push(directory);
    return directory;
}

async function writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, JSON.stringify(value));
}
