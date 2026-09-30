import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { InMemoryCmsRepository, P9R_CACHE } from "@bernouy/cms-content";
import { serveApi } from "cms-control/core/admin/registerEndpoints/serveApiFolder";
import getPageSeo from "cms-control/api/_content/page/_routes/seo.get";
import putPageSeo from "cms-control/api/_content/page/_routes/seo.put";

test("SEO endpoints are registered at the page route paths", async () => {
    const routes = new Set<string>();
    const runner = { addEndpoint: (method: string, path: string) => routes.add(`${method} ${path}`) };
    await serveApi(runner as never, resolve(import.meta.dir, "../../../../../src/api"), {});
    expect(routes).toContain("GET /page/seo");
    expect(routes).toContain("PUT /page/seo");
});

test("page SEO API saves translations and invalidates both language caches", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repository.insertPage("/a-propos", "À propos");
    const page = (await repository.getPage("/a-propos"))!;
    await repository.setPagePaths(page.id, { fr: "/a-propos", en: "/about" });
    const invalidated: string[] = [];
    const cms = {
        repository,
        cache: { deleteMatching: () => {}, delete: (key: string) => invalidated.push(key) },
    } as never;

    const before = await getPageSeo(new Request(`https://cms.test/api/page/seo?id=${page.id}`), cms);
    expect(await before.json()).toMatchObject({
        defaults: { title: "À propos", description: "" },
        languages: ["fr", "en"],
        translations: { fr: {}, en: {} },
    });
    const updated = await putPageSeo(
        new Request(`https://cms.test/api/page/seo?id=${page.id}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                translations: {
                    fr: { title: "Notre société" },
                    en: { title: "About us", description: "Our company" },
                },
            }),
        }),
        cms,
    );
    expect((await updated.json()).translations.en).toEqual({ title: "About us", description: "Our company" });
    expect((await repository.getPageById(page.id))?.seo?.fr?.title).toBe("Notre société");
    expect((await repository.getPageById(page.id))?.seo?.en?.title).toBe("About us");
    expect(invalidated).toEqual([P9R_CACHE.page("/a-propos"), P9R_CACHE.page("/en/about")]);
});

test("page SEO API rejects unconfigured languages and oversized titles", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repository.insertPage("/about", "About");
    const page = (await repository.getPage("/about"))!;
    const cms = { repository, cache: { deleteMatching: () => {}, delete: () => {} } } as never;
    for (const translations of [{ de: { title: "About" } }, { en: { title: "x".repeat(71) } }]) {
        await expect(
            putPageSeo(
                new Request(`https://cms.test/api/page/seo?id=${page.id}`, {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ translations }),
                }),
                cms,
            ),
        ).rejects.toMatchObject({ status: 400 });
    }
    expect((await repository.getPageById(page.id))?.seo).toBeUndefined();
});

test("page SEO editor reads canonical SEO keys for an older lowercase site language", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.updateSystem({ site: { language: "fr-fr" } as never });
    await repository.insertPage("/about", "About");
    const page = (await repository.getPage("/about"))!;
    const cms = { repository, cache: { deleteMatching: () => {}, delete: () => {} } } as never;

    const saved = await putPageSeo(
        new Request(`https://cms.test/api/page/seo?id=${page.id}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ translations: { "fr-fr": { title: "À propos" } } }),
        }),
        cms,
    );
    expect((await repository.getPageById(page.id))?.seo?.["fr-FR"]?.title).toBe("À propos");
    expect((await saved.json()).translations["fr-fr"]?.title).toBe("À propos");
    const reloaded = await getPageSeo(new Request(`https://cms.test/api/page/seo?id=${page.id}`), cms);
    expect((await reloaded.json()).translations["fr-fr"]?.title).toBe("À propos");
});
