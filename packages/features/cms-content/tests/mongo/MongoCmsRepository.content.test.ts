import { describe, expect, test } from "bun:test";
import type { TBloc } from "@bernouy/cms-content";
import { DuplicateBlocTagError, DuplicatePagePathError } from "@bernouy/cms-content";
import { createMongoContentRepository } from "./contentMongoFixture";

const card: TBloc = {
    id: "site-card",
    name: "Card",
    group: "Marketing",
    description: "A reusable card",
    editorJS: "editor-code",
    viewJS: "view-code",
    ownership: { kind: "code-managed" },
    source: { "index.ts": "c291cmNl" },
};

describe("MongoCmsRepository content persistence", () => {
    test("uses prefixed collections and initializes required unique indexes", async () => {
        const { db, repository } = createMongoContentRepository("tenant_");

        await repository.init();

        expect(db.get("tenant_pages").indexes).toEqual([{ keys: { path: 1 }, options: { unique: true } }]);
        expect(db.requestedCollections.every((name) => name.startsWith("tenant_"))).toBe(true);
    });

    test("stores, replaces, and projects blocs while translating duplicate tags", async () => {
        const { repository } = createMongoContentRepository();

        await expect(repository.createBloc(card)).resolves.toEqual(card);
        expect(await repository.getBlocViewJS(card.id)).toBe("view-code");
        expect(await repository.getBlocSource(card.id)).toEqual(card.source!);
        expect(await repository.getBlocsJS()).toEqual([{ id: card.id, editorJS: "editor-code", viewJS: "view-code" }]);
        expect(await repository.getBlocsList()).toEqual([
            {
                id: card.id,
                name: "Card",
                group: "Marketing",
                description: "A reusable card",
                ownership: { kind: "code-managed" },
            },
        ]);

        await repository.replaceBloc({ ...card, name: "Updated card", source: undefined });
        expect(await repository.getBlocsList()).toEqual([
            {
                id: card.id,
                name: "Updated card",
                group: "Marketing",
                description: "A reusable card",
                ownership: { kind: "code-managed" },
            },
        ]);
        expect(await repository.getBlocSource(card.id)).toBeNull();
        await expect(repository.createBloc(card)).rejects.toBeInstanceOf(DuplicateBlocTagError);
    });

    test("round-trips page documents and enforces published visibility", async () => {
        const { repository } = createMongoContentRepository();
        expect(await repository.getPage("/missing")).toBeNull();
        await repository.insertPage("/draft", "Draft");
        const draft = await repository.getPage("/draft");

        expect(draft).toMatchObject({ path: "/draft", title: "Draft", visible: false });
        expect(await repository.getPublishedPage("/draft")).toBeNull();
        await repository.updatePage({ id: draft!.id, visible: true, tags: ["news"] });

        expect(await repository.getPageById(draft!.id)).toMatchObject({ visible: true, tags: ["news"] });
        expect((await repository.getPublishedPages()).map((page) => page.id)).toEqual([draft!.id]);
        expect(await repository.getLinks()).toEqual([{ path: "/draft", title: "Draft" }]);
        await repository.deletePage(draft!.id);
        expect(await repository.getAllPages()).toEqual([]);
        await expect(repository.updatePage({ title: "Missing id" })).rejects.toThrow(/requires `id`/);
    });

    test("translates page path duplicate-key errors on insert and update", async () => {
        const { db, repository } = createMongoContentRepository();
        const pages = db.get("pages");
        pages.beforeInsertOne = duplicateKey;
        await expect(repository.insertPage("/taken", "Taken")).rejects.toBeInstanceOf(DuplicatePagePathError);

        delete pages.beforeInsertOne;
        await repository.insertPage("/draft", "Draft");
        const draft = await repository.getPage("/draft");
        pages.beforeUpdateOne = duplicateKey;
        await expect(repository.updatePage({ id: draft!.id, path: "/taken" })).rejects.toBeInstanceOf(
            DuplicatePagePathError,
        );
    });

    test("seeds and updates the singleton system document", async () => {
        const { repository } = createMongoContentRepository();

        const fresh = await repository.getSystem();
        expect(fresh).toMatchObject({ initializationStep: 0, site: { visible: true } });

        const updated = await repository.updateSystem({ initializationStep: 3 });
        expect(updated).toMatchObject({ initializationStep: 3, site: fresh.site });
        expect(await repository.getSystem()).toEqual(updated);
    });
});

async function duplicateKey(): Promise<never> {
    throw Object.assign(new Error("duplicate key"), { code: 11000 });
}

test("catalogue updates preserve installed source and editors and reject an ownership mismatch", async () => {
    const { repository, db } = createMongoContentRepository("tenant_");
    const ownership = {
        kind: "integration" as const,
        installationId: "gallery",
        integrationKind: "gallery",
        definitionVersion: "1.0.0",
    };
    await repository.createBloc({ ...card, ownership });
    const before = await repository.getBlocRecord(card.id);
    await repository.setBlocCatalogue(card.id, ownership, "inactive");
    expect(await repository.getBlocRecord(card.id)).toEqual({
        ...before!,
        artifact: { ...before!.artifact!, catalogue: "inactive" },
    });
    expect(await repository.getBlocsList()).toEqual([]);
    expect(await repository.getBlocsJS()).toEqual([{ id: card.id, editorJS: card.editorJS, viewJS: card.viewJS }]);
    expect(await repository.getBlocSource(card.id)).toEqual(card.source!);
    expect(db.get("tenant_blocs").replaceOneCalls).toHaveLength(0);
    await expect(
        repository.setBlocCatalogue(card.id, { ...ownership, installationId: "other" }, "active"),
    ).rejects.toThrow("owner changed");
    await expect(repository.setBlocCatalogue(card.id, ownership, "invalid" as "active")).rejects.toThrow("catalogue");
    await repository.setBlocCatalogue(card.id, ownership, "active");
    expect(await repository.getBlocsList()).toHaveLength(1);
});
