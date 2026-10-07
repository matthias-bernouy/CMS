import { describe, expect, test } from "bun:test";
import type { TBloc } from "@bernouy/cms-content";
import { DuplicateBlocTagError, DuplicatePagePathError, PageRevisionConflictError } from "@bernouy/cms-content";
import { createMongoContentRepository } from "../contentMongoFixture";

const card: TBloc = {
    id: "site-card",
    name: "Card",
    group: "Marketing",
    description: "A reusable card",
    viewJS: "view-code",
    ownership: { kind: "code-managed" },
    source: { "index.ts": "c291cmNl" },
};

describe("MongoCmsRepository content persistence", () => {
    test("uses prefixed collections and initializes required unique indexes", async () => {
        const { db, repository } = createMongoContentRepository("tenant_");

        await repository.init();

        expect(db.get("tenant_pages").indexes).toEqual([
            { keys: { path: 1 }, options: { unique: true } },
            { keys: { "deletionIntent.requestedAt": 1 }, options: { sparse: true } },
            { keys: { "pathUpdateIntent.requestedAt": 1 }, options: { sparse: true } },
            { keys: { contentReferences: 1 }, options: undefined },
        ]);
        expect(db.requestedCollections.every((name) => name.startsWith("tenant_"))).toBe(true);
    });

    test("maintains indexed reverse references when Page content changes", async () => {
        const { repository } = createMongoContentRepository();
        await repository.init();
        await repository.insertPage(
            "/references",
            "References",
            "<official-card>{{ cms.i18n.ulvia-official.card-title }}</official-card>",
        );
        const page = (await repository.getPage("/references"))!;

        expect(
            (await repository.scanPagesByContentReference({ kind: "bloc", tag: "official-card" }, undefined, 10)).pages,
        ).toHaveLength(1);
        expect(
            (
                await repository.scanPagesByContentReference(
                    { kind: "text", collectionId: "ulvia-official", textId: "card-title" },
                    undefined,
                    10,
                )
            ).pages,
        ).toHaveLength(1);

        await repository.updatePage({ id: page.id, content: "<main>Empty</main>" }, page.revision);
        expect(
            (await repository.scanPagesByContentReference({ kind: "bloc", tag: "official-card" }, undefined, 10)).pages,
        ).toEqual([]);
    });

    test("stores, replaces, and projects blocs while translating duplicate tags", async () => {
        const { repository } = createMongoContentRepository();

        await expect(repository.createBloc(card)).resolves.toEqual(card);
        expect(await repository.getBlocViewJS(card.id)).toBe("view-code");
        expect(await repository.getBlocSource(card.id)).toEqual(card.source!);
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

        expect(draft).toMatchObject({ path: "/draft", title: "Draft", visible: false, revision: 1 });
        expect(await repository.getPublishedPage("/draft")).toBeNull();
        expect(await repository.getPublishedPageById(draft!.id)).toBeNull();
        await repository.updatePage({ id: draft!.id, visible: true, tags: ["news"] }, draft!.revision);
        await expect(repository.updatePage({ id: draft!.id, title: "Stale" }, draft!.revision)).rejects.toBeInstanceOf(
            PageRevisionConflictError,
        );

        expect(await repository.getPageById(draft!.id)).toMatchObject({ visible: true, tags: ["news"], revision: 2 });
        expect(await repository.getPublishedPageById(draft!.id)).toMatchObject({ visible: true, tags: ["news"] });
        expect((await repository.getPublishedPages()).map((page) => page.id)).toEqual([draft!.id]);
        expect(await repository.getLinks()).toEqual([
            {
                page: { kind: "site", pageId: draft!.id },
                path: "/draft",
                title: "Draft",
                surface: "delivery",
            },
        ]);
        await expect(repository.deletePage(draft!.id, draft!.revision)).rejects.toBeInstanceOf(
            PageRevisionConflictError,
        );
        await repository.deletePage(draft!.id, 2);
        expect(await repository.getAllPages()).toEqual([]);
        await expect(repository.updatePage({ title: "Missing id" })).rejects.toThrow(/requires `id`/);
    });

    test("never publishes Control pages even when their visibility flag is set", async () => {
        const { repository } = createMongoContentRepository();
        await repository.insertPage("/admin/private", "Private", "<main>secret</main>", { surface: "control" });
        const controlPage = (await repository.getPage("/admin/private"))!;
        await repository.updatePage({ id: controlPage.id, visible: true });

        expect(await repository.getPublishedPage("/admin/private")).toBeNull();
        expect(await repository.getPublishedPageById(controlPage.id)).toBeNull();
        expect(await repository.getPublishedPages()).toEqual([]);
    });

    test("translates page path duplicate-key errors on insert and update", async () => {
        const { db, repository } = createMongoContentRepository();
        const pages = db.get("pages");
        pages.beforeInsertOne = duplicateKey;
        await expect(repository.insertPage("/taken", "Taken")).rejects.toBeInstanceOf(DuplicatePagePathError);

        delete pages.beforeInsertOne;
        await repository.updateSystem({ site: { language: "fr" } as never });
        await repository.insertPage("/draft", "Draft");
        const draft = await repository.getPage("/draft");
        db.get("page_routes").beforeInsertOne = duplicateKey;
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
