import { afterEach, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadCollectionBlocs } from "../../src/release/blocSources";
import { loadCollectionTexts } from "../../src/release/textSources";
import { loadCollectionMigrations } from "../../src/release/migrationSources";

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

test("component runtime modules stay inside the Bloc source boundary", async () => {
    const root = await temporaryDirectory();
    const componentRoot = join(root, "control", "example-manager");
    await writeJson(join(componentRoot, "definition.json"), {
        id: "example-manager",
        kind: "component",
        label: "bloc.example-manager.label",
        uses: [],
        requires: [],
        slots: {},
    });
    await Bun.write(join(componentRoot, "shadowdom.html"), "<div></div>");
    await Bun.write(join(componentRoot, "style.css"), ":host { display: block; }");
    await Bun.write(join(componentRoot, "runtime", "message.ts"), 'export const message = "modular-runtime";');
    await Bun.write(
        join(componentRoot, "bloc.ts"),
        `import { Component } from "@bernouy/components/base";
         import template from "./shadowdom.html" with { type: "text" };
         import css from "./style.css" with { type: "text" };
         import { message } from "./runtime/message";
         export class Bloc extends Component { constructor() { super({ css, template }); this.dataset.message = message; } }`,
    );

    const blocs = (await loadCollectionBlocs(root, "Example")) as { runtime: { viewJS: string } }[];
    expect(blocs[0]!.runtime.viewJS).toContain("modular-runtime");

    const compositionRoot = join(root, "content", "example-composition");
    await writeComposition(compositionRoot, "example-composition");
    await Bun.write(join(compositionRoot, "runtime", "invalid.ts"), "export {};");
    await expect(loadCollectionBlocs(root, "Example")).rejects.toThrow("must have only lightdom.html");
});

test("Bloc discovery follows the collection admission ceiling beyond the former 256 limit", async () => {
    const root = await temporaryDirectory();
    await Promise.all(
        Array.from({ length: 257 }, (_, index) => {
            const id = `example-bloc-${index}`;
            return writeComposition(join(root, "catalogue", id), id);
        }),
    );
    expect(await loadCollectionBlocs(root, "Example")).toHaveLength(257);
});

test("migration steps are discovered recursively and named after their adjacent generations", async () => {
    const root = await temporaryDirectory();
    expect(await loadCollectionMigrations(join(root, "missing"))).toEqual([]);
    const first = { fromGeneration: 1, toGeneration: 2, operations: [] };
    const second = { fromGeneration: 2, toGeneration: 3, operations: [] };
    await writeJson(join(root, "legacy", "1-to-2.json"), first);
    await writeJson(join(root, "current", "2-to-3.json"), second);
    expect(await loadCollectionMigrations(root)).toEqual([second, first]);

    await writeJson(join(root, "current", "wrong.json"), { fromGeneration: 3, toGeneration: 4, operations: [] });
    await expect(loadCollectionMigrations(root)).rejects.toThrow("must be named 3-to-4.json");
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
