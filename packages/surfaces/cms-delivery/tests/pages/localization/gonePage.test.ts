import { expect, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { parseHTML } from "linkedom";
import { mountPublicPages } from "../publicPage.fixture";

test("a gone URL renders the configured 404 page with status 410 and no search identity", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.updateSystem({
        site: {
            host: "https://example.test",
            language: "fr",
            additionalLanguages: ["en"],
            activeLanguages: ["en"],
        } as never,
    });
    await repository.insertPage("/not-found", "Not found", "<main>Find another page</main>");
    await repository.insertPage("/old", "Old");
    const fallback = (await repository.getPage("/not-found"))!;
    const old = (await repository.getPage("/old"))!;
    await repository.updatePage({ id: fallback.id, visible: true });
    await repository.updatePage({ id: old.id, visible: true });
    await repository.setPagePaths(old.id, { fr: "/old", en: "/old" });
    await repository.updateSystem({ site: { notFound: { kind: "site", pageId: fallback.id } } as never });
    await repository.deletePage(old.id);
    const mounted = mountPublicPages({ repository });

    const gone = await mounted.get(new Request("https://example.test/en/old"));
    expect(gone.status).toBe(410);
    expect(gone.headers.get("cache-control")).toBe("no-store");
    const { document } = parseHTML(await gone.text());
    expect(document.documentElement.getAttribute("lang")).toBe("en");
    expect(document.querySelector("main")?.textContent).toBe("Find another page");
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex,follow");
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.querySelector("link[hreflang]")).toBeNull();
    const head = await mounted.head(new Request("https://example.test/en/old", { method: "HEAD" }));
    expect(head.status).toBe(410);
    expect(await head.text()).toBe("");

    const missing = await mounted.get(new Request("https://example.test/missing"));
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("Find another page");
    const fallbackPage = await mounted.get(new Request("https://example.test/not-found"));
    expect(fallbackPage.status).toBe(200);
    expect(await fallbackPage.text()).toContain("Find another page");
});
