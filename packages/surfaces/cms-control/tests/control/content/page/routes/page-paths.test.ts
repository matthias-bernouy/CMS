import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { DuplicatePagePathError, InMemoryCmsRepository } from "@bernouy/cms-content";
import { serveApi } from "cms-control/core/admin/registerEndpoints/serveApiFolder";
import getPaths from "cms-control/api/_content/page/_routes/paths.get";
import putPaths from "cms-control/api/_content/page/_routes/paths.put";
import deletePage from "cms-control/api/_content/page/page.delete";

test("page language routes are registered when Control discovers API files", async () => {
    const routes = new Set<string>();
    const runner = {
        addEndpoint(method: string, path: string) {
            routes.add(`${method} ${path}`);
        },
    };
    await serveApi(runner as never, resolve(import.meta.dir, "../../../../../src/api"), {});
    expect(routes).toContain("GET /page/paths");
    expect(routes).toContain("PUT /page/paths");
    expect(routes).toContain("GET /page/exists");
});

test("legacy page detail exposes its current URL in the old column", async () => {
    const cms = {
        repository: {
            getPageById: async () => ({ id: "legacy", path: "/legacy", title: "Legacy" }),
            getSystem: async () => ({ site: { language: "fr", additionalLanguages: ["en"] } }),
        },
    } as never;
    const response = await getPaths(new Request("https://cms.test/api/page/paths?id=legacy"), cms);
    const detail = await response.json();
    expect(detail.paths).toEqual({ fr: "/legacy" });
    expect(detail.languages[0]).toMatchObject({ code: "fr", publicPath: "/legacy" });
});

test("page path API edits one page and reserves every old URL", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.updateSystem({
        site: { language: "fr", additionalLanguages: ["en"], activeLanguages: ["en"] } as never,
    });
    await repository.insertPage("/first", "First");
    await repository.insertPage("/second", "Second");
    const first = (await repository.getPage("/first"))!;
    const second = (await repository.getPage("/second"))!;
    await repository.updatePage({ id: first.id, visible: true });
    await repository.updatePage({ id: second.id, visible: true });
    const invalidated: string[] = [];
    const cms = {
        repository,
        cache: {
            delete: (key: string) => invalidated.push(key),
            deleteMatching: (prefix: (key: string) => boolean) => {
                if (prefix("page:first")) {
                    invalidated.push("pages");
                }
            },
        },
    } as never;

    const detail = await getPaths(new Request(`https://cms.test/api/page/paths?id=${first.id}`), cms);
    expect((await detail.json()).languages).toEqual([
        { code: "fr", active: true, default: true, publicPath: "/first" },
        { code: "en", active: true, default: false, publicPath: "" },
    ]);
    const updated = await putPaths(
        new Request(`https://cms.test/api/page/paths?id=${first.id}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ paths: { fr: "/premier", en: "/first" }, expectedPaths: { fr: "/first" } }),
        }),
        cms,
    );
    expect((await updated.json()).paths).toEqual({ fr: "/premier", en: "/first" });
    expect(await repository.getPageRoute("/first")).toMatchObject({ state: "redirect", pageId: first.id });
    expect(invalidated).toContain("pages");

    await expect(repository.setPagePaths(second.id, { fr: "/second", en: "/first" })).rejects.toBeInstanceOf(
        DuplicatePagePathError,
    );
    const deletion = await deletePage(
        new Request(`https://cms.test/api/page?id=${first.id}&alternativeId=${second.id}`, { method: "DELETE" }),
        cms,
    );
    expect(deletion.status).toBe(200);
    expect(await repository.getPageRoute("/first")).toMatchObject({ state: "redirect", pageId: second.id });
    expect(await repository.getPageRoute("/en/first")).toMatchObject({ state: "redirect", pageId: second.id });

    await deletePage(new Request(`https://cms.test/api/page?id=${second.id}`, { method: "DELETE" }), cms);
    expect(await repository.getPageRoute("/first")).toMatchObject({ state: "gone" });
    expect(await repository.getPageRoute("/en/first")).toMatchObject({ state: "gone" });
});
