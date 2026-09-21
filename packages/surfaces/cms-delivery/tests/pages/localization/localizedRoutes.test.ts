import { expect, test } from "bun:test";
import { InMemoryCmsRepository, type TSystem } from "@bernouy/cms-content";
import type { PublicPageProvider } from "@bernouy/cms-delivery";
import { parseHTML } from "linkedom";
import SitemapServer from "cms-delivery/endpoints/sitemap.xml.server";
import { mountPublicPages } from "../publicPage.fixture";

test("retired paths redirect while localized variants share one page", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.insertPage("/about", "About", "<main>Shared content</main>");
    const page = (await repository.getPage("/about"))!;
    await repository.updatePage({ id: page.id, visible: true });
    await repository.updateSystem({
        site: {
            host: "https://example.test",
            language: "fr",
            additionalLanguages: ["en"],
            activeLanguages: ["en"],
        } as never,
    });
    await repository.setPagePaths(page.id, { fr: "/a-propos", en: "/about" });
    const mounted = mountPublicPages({ repository });

    const retired = await mounted.get(new Request("https://example.test/about?ref=old"));
    expect(retired.status).toBe(301);
    expect(retired.headers.get("location")).toBe("/a-propos?ref=old");
    const retiredHead = await mounted.head(new Request("https://example.test/about", { method: "HEAD" }));
    expect(retiredHead.status).toBe(301);
    expect(await retiredHead.text()).toBe("");

    for (const [path, language] of [
        ["/a-propos", "fr"],
        ["/en/about", "en"],
    ]) {
        const response = await mounted.get(new Request(`https://example.test${path}`));
        expect(response.status).toBe(200);
        const { document } = parseHTML(await response.text());
        expect(document.documentElement.getAttribute("lang")).toBe(language);
        expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
            `https://example.test${path}`,
        );
        expect(document.querySelector('link[hreflang="fr"]')?.getAttribute("href")).toBe(
            "https://example.test/a-propos",
        );
        expect(document.querySelector('link[hreflang="en"]')?.getAttribute("href")).toBe(
            "https://example.test/en/about",
        );
        expect(document.querySelector('link[hreflang="x-default"]')?.getAttribute("href")).toBe(
            "https://example.test/a-propos",
        );
        expect(document.body.textContent).toContain("Shared content");
    }

    const sitemap = await SitemapServer(new Request("https://example.test/sitemap.xml"), mounted.delivery);
    const xml = await sitemap.text();
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain("<loc>https://example.test/a-propos</loc>");
    expect(xml).toContain("<loc>https://example.test/en/about</loc>");
    expect(xml).not.toContain("<loc>https://example.test/about</loc>");
    const localizedEntries = xml.match(/<url>.*?<\/url>/gu) ?? [];
    expect(localizedEntries).toHaveLength(2);
    for (const entry of localizedEntries) {
        expect(entry).toContain('hreflang="fr" href="https://example.test/a-propos"');
        expect(entry).toContain('hreflang="en" href="https://example.test/en/about"');
        expect(entry).toContain('hreflang="x-default" href="https://example.test/a-propos"');
    }

    await repository.setPagePaths(page.id, { fr: "/a-propos", en: "/company" });
    await repository.updateSystem({ site: { additionalLanguages: [], activeLanguages: [] } as never });
    const removedLanguage = await mounted.get(new Request("https://example.test/en/about"));
    expect(removedLanguage.status).toBe(301);
    expect(removedLanguage.headers.get("location")).toBe("/a-propos");
    const inactiveSitemap = await SitemapServer(new Request("https://example.test/sitemap.xml"), mounted.delivery);
    const inactiveXml = await inactiveSitemap.text();
    expect(inactiveXml).not.toContain("/en/company");
    expect(inactiveXml).not.toContain("hreflang=");
});

test("public routes pause while the default language routes are changing", async () => {
    class PausedRouteChangeRepository extends InMemoryCmsRepository {
        pause: Promise<void> | null = null;

        protected override async reconfigurePageRoutes(
            system: TSystem,
            previousDefaultLanguage?: string,
            dryRun = false,
        ): Promise<void> {
            if (!dryRun && this.pause) {
                const pending = this.pause;
                this.pause = null;
                await pending;
            }
            await super.reconfigurePageRoutes(system, previousDefaultLanguage, dryRun);
        }
    }
    const repository = new PausedRouteChangeRepository();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repository.insertPage("/francais", "About");
    const page = (await repository.getPage("/francais"))!;
    await repository.updatePage({ id: page.id, visible: true });
    await repository.setPagePaths(page.id, { fr: "/francais", en: "/english" });
    const mounted = mountPublicPages({ repository });
    let release!: () => void;
    repository.pause = new Promise<void>((resolve) => {
        release = resolve;
    });
    const switchLanguage = repository.updateSystem({
        site: { language: "en", additionalLanguages: ["fr"], activeLanguages: ["fr"] } as never,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await repository.getSystem()).pageRoutesUpdating).toBe(true);
    const paused = await mounted.get(new Request("https://example.test/francais"));
    expect(paused.status).toBe(503);
    expect(paused.headers.get("location")).toBeNull();
    expect(paused.headers.get("cache-control")).toBe("no-store");

    release();
    await switchLanguage;
    const moved = await mounted.get(new Request("https://example.test/francais"));
    expect(moved.status).toBe(301);
    expect(moved.headers.get("location")).toBe("/fr/francais");
    expect((await mounted.get(new Request("https://example.test/english"))).status).toBe(200);
});

test("deleted paths return 410 and cannot fall through to a public provider", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.updateSystem({
        site: {
            host: "https://example.test",
            language: "fr",
            additionalLanguages: ["en"],
            activeLanguages: ["en"],
        } as never,
    });
    await repository.insertPage("/old", "Old");
    const page = (await repository.getPage("/old"))!;
    await repository.updatePage({ id: page.id, visible: true });
    await repository.setPagePaths(page.id, { fr: "/old", en: "/old" });
    await repository.deletePage(page.id);
    let providerCalled = false;
    const provider: PublicPageProvider = {
        resolvePage: async () => {
            providerCalled = true;
            return null;
        },
        listSitemapPaths: async () => ["/old", "/en/old"],
    };
    const mounted = mountPublicPages({ repository, providers: [provider] });
    for (const path of ["/old", "/en/old"]) {
        const response = await mounted.get(new Request(`https://example.test${path}`));
        expect(response.status).toBe(410);
    }
    const goneHead = await mounted.head(new Request("https://example.test/old", { method: "HEAD" }));
    expect(goneHead.status).toBe(410);
    expect(await goneHead.text()).toBe("");
    expect(providerCalled).toBe(false);
    const sitemap = await SitemapServer(new Request("https://example.test/sitemap.xml"), mounted.delivery);
    expect(sitemap.status).toBe(200);
    expect(await sitemap.text()).not.toContain("/old");
});

test("the default language home stays at the site root", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.insertPage("/", "Home");
    const home = (await repository.getPage("/"))!;
    await repository.updatePage({ id: home.id, visible: true });
    await repository.updateSystem({ site: { language: "fr" } as never });
    const mounted = mountPublicPages({ repository });

    const current = await mounted.get(new Request("https://example.test/"));
    expect(current.status).toBe(200);
    expect((await mounted.get(new Request("https://example.test/fr"))).status).toBe(404);
});

test("a former prefixed default URL redirects to the current root URL", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repository.insertPage("/about", "About");
    const page = (await repository.getPage("/about"))!;
    await repository.updatePage({ id: page.id, visible: true });
    await repository.setPagePaths(page.id, { fr: "/about", en: "/about" });
    await repository.updateSystem({ site: { language: "en", additionalLanguages: ["fr"] } as never });
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    const mounted = mountPublicPages({ repository });

    const retired = await mounted.get(new Request("https://example.test/fr/about?ref=old"));
    expect(retired.status).toBe(301);
    expect(retired.headers.get("location")).toBe("/about?ref=old");
    expect((await mounted.get(new Request("https://example.test/about"))).status).toBe(200);
});

test("a system fallback follows a chosen replacement after its page is deleted", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.updateSystem({ site: { language: "fr" } as never });
    await repository.insertPage("/not-found", "Not found", "<main>Old fallback</main>");
    await repository.insertPage("/replacement", "Replacement", "<main>Replacement fallback</main>");
    const old = (await repository.getPage("/not-found"))!;
    const replacement = (await repository.getPage("/replacement"))!;
    await repository.updatePage({ id: old.id, visible: true });
    await repository.updatePage({ id: replacement.id, visible: true });
    await repository.updateSystem({ site: { notFound: { id: old.id, path: old.path } } as never });
    await repository.deletePageWithAlternative(old.id, replacement.id);
    const mounted = mountPublicPages({ repository });

    const response = await mounted.get(new Request("https://example.test/missing"));
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Replacement fallback");
});

test("a configured language path becomes public only when the language is active", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.updateSystem({
        site: { language: "fr", additionalLanguages: ["en"], activeLanguages: [] } as never,
    });
    await repository.insertPage("/intro", "Intro");
    const page = (await repository.getPage("/intro"))!;
    await repository.updatePage({ id: page.id, visible: true });
    await repository.setPagePaths(page.id, { fr: "/intro", en: "/intro" });
    const mounted = mountPublicPages({ repository });

    expect((await mounted.get(new Request("https://example.test/en/intro"))).status).toBe(404);
    await repository.updateSystem({ site: { activeLanguages: ["en"] } as never });
    expect((await mounted.get(new Request("https://example.test/en/intro"))).status).toBe(200);
});
