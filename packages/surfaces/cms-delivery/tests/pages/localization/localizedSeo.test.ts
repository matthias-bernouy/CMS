import { expect, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { parseHTML } from "linkedom";
import { mountPublicPages } from "../publicPage.fixture";

test("each language renders its own SEO copy and inherits untranslated fields", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.updateSystem({
        site: {
            host: "https://example.test",
            language: "fr",
            additionalLanguages: ["en"],
            activeLanguages: ["en"],
        } as never,
    });
    await repository.insertPage("/a-propos", "À propos");
    const page = (await repository.getPage("/a-propos"))!;
    await repository.setPagePaths(page.id, { fr: "/a-propos", en: "/about" });
    await repository.updatePage({
        id: page.id,
        visible: true,
        description: "Notre entreprise",
        seo: { fr: { title: "Notre société" }, en: { title: "About us" } },
    });
    const mounted = mountPublicPages({ repository });

    const french = parseHTML(await (await mounted.get(new Request("https://example.test/a-propos"))).text()).document;
    const english = parseHTML(await (await mounted.get(new Request("https://example.test/en/about"))).text()).document;
    expect(french.title).toBe("Notre société");
    expect(french.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Notre entreprise");
    expect(english.title).toBe("About us");
    expect(english.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Notre entreprise");
    expect(english.documentElement.getAttribute("lang")).toBe("en");
    expect(english.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://example.test/en/about");
    expect(english.querySelector('link[hreflang="fr"]')?.getAttribute("href")).toBe("https://example.test/a-propos");

    await repository.updatePage({ id: page.id, seo: { en: { title: "About us", description: "Our company" } } });
    const refreshed = mountPublicPages({ repository });
    const updated = parseHTML(
        await (await refreshed.get(new Request("https://example.test/en/about"))).text(),
    ).document;
    expect(updated.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Our company");
});

test("SEO copy stays attached to language codes when the default language changes", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.updateSystem({
        site: {
            host: "https://example.test",
            language: "fr",
            additionalLanguages: ["en"],
            activeLanguages: ["en"],
        } as never,
    });
    await repository.insertPage("/a-propos", "Page name");
    const page = (await repository.getPage("/a-propos"))!;
    await repository.setPagePaths(page.id, { fr: "/a-propos", en: "/about" });
    await repository.updatePage({
        id: page.id,
        visible: true,
        seo: { fr: { title: "Notre société" }, en: { title: "Our company" } },
    });
    await repository.updateSystem({
        site: { language: "en", additionalLanguages: ["fr"], activeLanguages: ["fr"] } as never,
    });
    const mounted = mountPublicPages({ repository });

    const english = parseHTML(await (await mounted.get(new Request("https://example.test/about"))).text()).document;
    const french = parseHTML(
        await (await mounted.get(new Request("https://example.test/fr/a-propos"))).text(),
    ).document;
    expect(english.title).toBe("Our company");
    expect(french.title).toBe("Notre société");
    expect(english.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://example.test/about");
});

test("Delivery renders a canonical SEO key for a lowercase configured language", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.updateSystem({ site: { host: "https://example.test", language: "fr-fr" } as never });
    await repository.insertPage("/about", "About");
    const page = (await repository.getPage("/about"))!;
    await repository.updatePage({ id: page.id, visible: true, seo: { "fr-FR": { title: "À propos" } } });

    const mounted = mountPublicPages({ repository });
    const response = await mounted.get(new Request("https://example.test/about"));
    expect(response.status).toBe(200);
    expect(parseHTML(await response.text()).document.title).toBe("À propos");
});
