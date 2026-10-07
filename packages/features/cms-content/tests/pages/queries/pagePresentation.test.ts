import { describe, expect, test } from "bun:test";
import {
    getCmsPage,
    InMemoryCmsRepository,
    PageRevisionConflictError,
    updateCmsPageRoute,
    updateCmsPageSeo,
} from "@bernouy/cms-content";

async function pageFixture(): Promise<{ repository: InMemoryCmsRepository; id: string; revision: number }> {
    const repository = new InMemoryCmsRepository();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repository.insertPage("/welcome", "Welcome");
    const [page] = await repository.getAllPages();
    return { repository, id: page!.id, revision: page!.revision };
}

describe("CMS Page presentation contracts", () => {
    test("projects every configured language and updates routes one language at a time", async () => {
        const { repository, id, revision } = await pageFixture();

        const initial = await getCmsPage(repository, { id });
        const updated = await updateCmsPageRoute(repository, {
            id,
            expectedRevision: revision,
            language: "en",
            path: "/welcome",
        });

        expect(initial.routes).toEqual([
            { language: "fr", path: "/welcome", primary: true },
            { language: "en", path: "", primary: false },
        ]);
        expect(updated.routes[1]).toEqual({ language: "en", path: "/welcome", primary: false });
        expect(await repository.getPageRoute("/en/welcome")).toMatchObject({ language: "en", pageId: id });
    });

    test("updates localized SEO and rejects stale revisions", async () => {
        const { repository, id, revision } = await pageFixture();
        const updated = await updateCmsPageSeo(repository, {
            id,
            expectedRevision: revision,
            language: "fr",
            title: "Accueil",
            description: "Description de la page",
        });

        expect(updated.seoEntries[0]).toEqual({
            language: "fr",
            title: "Accueil",
            description: "Description de la page",
        });
        await expect(
            updateCmsPageSeo(repository, { id, expectedRevision: revision, language: "fr", title: "Obsolete" }),
        ).rejects.toBeInstanceOf(PageRevisionConflictError);
    });

    test("rejects languages that are not enabled on the site", async () => {
        const { repository, id, revision } = await pageFixture();
        await expect(
            updateCmsPageRoute(repository, { id, expectedRevision: revision, language: "de", path: "/hallo" }),
        ).rejects.toThrow("not configured");
    });
});
