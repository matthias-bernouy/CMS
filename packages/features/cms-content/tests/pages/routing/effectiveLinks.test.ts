import { expect, test } from "bun:test";
import {
    InMemoryContentRepository,
    ValidatingContentRepository,
    PageReferencedError,
    ContentValidationError,
} from "@bernouy/cms-content";
import { createMongoContentRepository } from "../../application/mongo/contentMongoFixture";

for (const adapter of ["memory", "mongo"] as const) {
    const fixture = async (markup = "<main><slot></slot></main>") => {
        const inner =
            adapter === "memory" ? new InMemoryContentRepository() : createMongoContentRepository().repository;
        if (adapter === "mongo") {
            await inner.init();
        }
        await inner.createBloc({
            id: "test-shell",
            name: "Shell",
            group: "Test",
            viewJS: "",
            markupHTML: markup,
            kind: "component",
            root: { accepts: ["div"] },
            slots: { "": { accepts: [{ kind: "native-content", profile: "prose" }] } },
            ownership: { kind: "code-managed" },
        });
        return { inner, repo: new ValidatingContentRepository(inner) };
    };

    test(`${adapter}: template links are checked before publication and protect incoming references on deletion`, async () => {
        const { inner, repo } = await fixture('<main><a href="/target">Target</a><slot></slot></main>');
        await repo.insertPage("/source", "Source", '<div cms-bloc="test-shell"></div>');
        const source = (await repo.getPage("/source"))!;
        await expect(repo.updatePage({ id: source.id, visible: true }, source.revision)).rejects.toBeInstanceOf(
            ContentValidationError,
        );
        expect(await inner.getPageById(source.id)).toMatchObject({ revision: source.revision, visible: false });
        await repo.insertPage("/target", "Target");
        const target = (await repo.getPage("/target"))!;
        const published = (await repo.updatePage({ id: source.id, visible: true }, source.revision))!;
        expect(published.diagnostics).toContainEqual(
            expect.objectContaining({
                code: "page.route_draft",
                severity: "warning",
                location: expect.objectContaining({ blocId: "test-shell" }),
            }),
        );
        await expect(repo.deletePage(target.id, target.revision)).rejects.toBeInstanceOf(PageReferencedError);
        expect(await inner.getPageById(target.id)).not.toBeNull();
        expect((await inner.getPageById(source.id))!).not.toHaveProperty("diagnostics");
    });

    test(`${adapter}: anchors, relative paths and grouped target reads use the expanded documents`, async () => {
        const { inner, repo } = await fixture(
            '<main><a href="../target#heading">One</a><a href="/target#heading">Two</a><slot></slot></main>',
        );
        await inner.insertPage("/target", "Target", '<div cms-bloc="test-shell"><p id="heading">Heading</p></div>');
        let target = (await inner.getPage("/target"))!;
        target = (await inner.updatePage({ id: target.id, visible: true }, target.revision))!;
        let batches = 0;
        const batch = inner.getPagesByIds!.bind(inner);
        inner.getPagesByIds = async (ids) => {
            batches++;
            expect(ids).toEqual([target.id]);
            return batch(ids);
        };
        const feedback = await repo.insertPage("/nested/source", "Source", '<div cms-bloc="test-shell"></div>');
        expect(feedback?.diagnostics).toEqual([]);
        expect(batches).toBe(1);
        const source = (await repo.getPage("/nested/source"))!;
        await inner.updatePage({ id: target.id, content: "" }, target.revision);
        await expect(repo.updatePage({ id: source.id, visible: true }, source.revision)).rejects.toMatchObject({
            diagnostics: [
                expect.objectContaining({ code: "page.fragment_missing" }),
                expect.objectContaining({ code: "page.fragment_missing" }),
            ],
        });
    });

    test(`${adapter}: a missing local fragment is advisory in a draft and blocking on publication`, async () => {
        const { repo } = await fixture();
        const feedback = await repo.insertPage(
            "/source",
            "Source",
            '<div cms-bloc="test-shell"><a href="#missing">Jump</a></div>',
        );
        expect(feedback?.diagnostics).toContainEqual(
            expect.objectContaining({ code: "page.fragment_missing", severity: "warning" }),
        );
        const page = (await repo.getPage("/source"))!;
        await expect(repo.updatePage({ id: page.id, visible: true }, page.revision)).rejects.toThrow("has no target");
    });
}
