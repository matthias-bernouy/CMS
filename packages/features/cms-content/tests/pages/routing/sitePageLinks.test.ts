import { expect, test } from "bun:test";
import {
    createContentReader,
    InMemoryCmsRepository,
    InMemoryPageRouteRegistry,
    validatePageLinks,
    withSitePageRoutes,
} from "@bernouy/cms-content";

test("a renamed Page keeps authored links valid through its historical route", async () => {
    const inner = new InMemoryCmsRepository();
    const routes = new InMemoryPageRouteRegistry();
    const repository = withSitePageRoutes(inner, routes, "site");
    await repository.insertPage("/target", "Target", "<main>Target</main>");
    let target = (await repository.getPage("/target"))!;
    target = (await repository.updatePage({ id: target.id, visible: true }, target.revision))!;
    await repository.insertPage("/source", "Source", '<a href="/target">Target</a>');
    const source = (await repository.getPage("/source"))!;

    await repository.updatePage({ id: target.id, path: "/renamed" }, target.revision);

    await expect(repository.updatePage({ id: source.id, title: "Updated" }, source.revision)).resolves.toMatchObject({
        title: "Updated",
    });
    await expect(validatePageLinks(repository, routes, "site")).resolves.toBeUndefined();
    const reader = createContentReader(inner);
    await expect(reader.resolveRenderableRoute("/target")).resolves.toEqual({
        kind: "redirect",
        path: "/renamed",
    });
    await expect(reader.resolvePagePaths(["/target"])).resolves.toEqual({ "/target": "/renamed" });
});

test("a newly inserted Page may link to its own route", async () => {
    const repository = withSitePageRoutes(new InMemoryCmsRepository(), new InMemoryPageRouteRegistry(), "site");

    await expect(
        repository.insertPage("/self", "Self", '<main><a href="/self#details">Details</a></main>'),
    ).resolves.toBeUndefined();
});

test("a Page may rename its route and self-link in the same write", async () => {
    const repository = withSitePageRoutes(new InMemoryCmsRepository(), new InMemoryPageRouteRegistry(), "site");
    await repository.insertPage("/before", "Before", '<a href="/before">Before</a>');
    const page = (await repository.getPage("/before"))!;

    await expect(
        repository.updatePage({ id: page.id, path: "/after", content: '<a href="/after">After</a>' }, page.revision),
    ).resolves.toMatchObject({ path: "/after" });
});
