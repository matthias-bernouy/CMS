import { expect, test } from "bun:test";
import { InMemoryContentRepository, ValidatingContentRepository, PageReferencedError } from "@bernouy/cms-content";
import { createMongoContentRepository } from "../../application/mongo/contentMongoFixture";

const factories = {
    memory: async () => new InMemoryContentRepository(),
    mongo: async () => {
        const { repository } = createMongoContentRepository();
        await repository.init();
        return repository;
    },
};
const content = (path: string) => `<main cms-bloc="test-page"><p><a href="${path}">Link</a></p></main>`;
for (const [adapter, factory] of Object.entries(factories)) {
    async function fixture() {
        const inner = await factory();
        await inner.createBloc({
            id: "test-page",
            name: "Page",
            group: "Test",
            viewJS: "",
            markupHTML: "<slot></slot>",
            kind: "component",
            root: { accepts: ["main"] },
            slots: { "": { accepts: [{ kind: "native-content", profile: "prose" }] } },
            ownership: { kind: "code-managed" },
        });
        return { inner, repo: new ValidatingContentRepository(inner) };
    }
    test(`${adapter}: Page insert/update/publication reject unavailable links but permit self links and draft targets`, async () => {
        const { repo, inner } = await fixture();
        await expect(repo.insertPage("/broken", "Broken", content("/missing"))).rejects.toThrow("unavailable route");
        expect(await repo.getPage("/broken")).toBeNull();
        await repo.insertPage("/source", "Source", content("/source"));
        const source = (await repo.getPage("/source"))!;
        await expect(
            repo.updatePage({ id: source.id, content: content("/missing") }, source.revision),
        ).rejects.toThrow();
        await repo.insertPage("/target", "Target");
        await repo.updatePage({ id: source.id, content: content("/target?query=one#anchor") }, source.revision);
        await inner.insertPage("/raw", "Raw", content("/missing"));
        const raw = (await repo.getPage("/raw"))!;
        await expect(repo.updatePage({ id: raw.id, visible: true }, raw.revision)).rejects.toThrow("unavailable route");
    });
    test(`${adapter}: referenced localized aliases block deletion until links are removed`, async () => {
        const { repo } = await fixture();
        await repo.updateSystem({
            site: { language: "en", additionalLanguages: ["fr"], activeLanguages: ["fr"] },
        } as never);
        await repo.insertPage("/target", "Target");
        let target = (await repo.getPage("/target"))!;
        target = await repo.setPagePaths(
            target.id,
            { en: "/target", fr: "/cible" },
            undefined,
            undefined,
            target.revision,
        );
        await repo.insertPage("/source", "Source", content("/fr/cible"));
        target = await repo.setPagePaths(
            target.id,
            { en: "/target", fr: "/nouvelle-cible" },
            undefined,
            undefined,
            target.revision,
        );
        await expect(repo.deletePage(target.id, target.revision)).rejects.toBeInstanceOf(PageReferencedError);
        expect(await repo.getPageById(target.id)).not.toBeNull();
        const source = (await repo.getPage("/source"))!;
        await repo.updatePage({ id: source.id, content: "" }, source.revision);
        await repo.deletePage(target.id, target.revision);
        expect((await repo.getPageRoute("/fr/cible"))?.state).toBe("gone");
    });
    test(`${adapter}: an alternative preserves incoming routes and permits deletion`, async () => {
        const { repo } = await fixture();
        await repo.insertPage("/target", "Target");
        await repo.insertPage("/alternative", "Alternative");
        let alternative = (await repo.getPage("/alternative"))!;
        alternative = (await repo.updatePage({ id: alternative.id, visible: true }, alternative.revision))!;
        await repo.insertPage("/source", "Source", content("/target"));
        const target = (await repo.getPage("/target"))!;
        await repo.deletePageWithAlternative(target.id, alternative.id, target.revision);
        expect(await repo.getPageRoute("/target")).toMatchObject({ state: "redirect", pageId: alternative.id });
    });
    test(`${adapter}: deletion waits for a validated link write to persist before scanning incoming links`, async () => {
        const { repo, inner } = await fixture();
        await repo.insertPage("/target", "Target");
        const target = (await repo.getPage("/target"))!;
        let release!: () => void;
        let started!: () => void;
        const paused = new Promise<void>((resolve) => {
            release = resolve;
        });
        const inserting = new Promise<void>((resolve) => {
            started = resolve;
        });
        const insert = inner.insertPage.bind(inner);
        inner.insertPage = async (...args) => {
            if (args[0] === "/source") {
                started();
                await paused;
            }
            return insert(...args);
        };
        const writing = repo.insertPage("/source", "Source", content("/target"));
        await inserting;
        const deleting = repo.deletePage(target.id, target.revision);
        release();
        const results = await Promise.allSettled([writing, deleting]);
        expect(results.map(({ status }) => status)).toEqual(["fulfilled", "rejected"]);
        expect(results[1]).toMatchObject({ reason: expect.any(PageReferencedError) });
        expect(await repo.getPageById(target.id)).not.toBeNull();
    });
}
