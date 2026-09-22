import { gunzipSync } from "bun";
import { expect, test } from "bun:test";
import { InMemoryCmsRepository, validateSettingsPatch } from "@bernouy/cms-content";
import type { PublicPageProvider } from "@bernouy/cms-delivery";
import { InMemoryCmsFilesBlob } from "@bernouy/cms-content/files";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { materializeSitemapSnapshot } from "cms-delivery/core/seo/sitemap/materialize";
import { readSitemapManifest, sitemapChunkPath } from "cms-delivery/core/seo/sitemap/manifest";
import SitemapServer from "cms-delivery/endpoints/sitemap.xml.server";
import { mountPublicPages } from "../publicPage.fixture";
import { COMMERCE_SOURCE, PRODUCT_PAGE } from "../indexing/fixtures";

test("sitemap snapshots separate languages and common URLs while retaining reciprocal links", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.updateSystem({
        site: {
            host: "https://example.test",
            language: "fr",
            additionalLanguages: ["en"],
            activeLanguages: ["en"],
        } as never,
    });
    await repository.insertPage("/a-propos", "About");
    const about = (await repository.getPage("/a-propos"))!;
    await repository.updatePage({ id: about.id, visible: true });
    await repository.setPagePaths(about.id, { fr: "/a-propos", en: "/about" });
    await repository.insertPage("/produits/fiche", "Product");
    const product = (await repository.getPage("/produits/fiche"))!;
    await repository.updatePage({
        id: product.id,
        visible: true,
        content: PRODUCT_PAGE.content,
        indexing: PRODUCT_PAGE.indexing,
    });
    await repository.setPagePaths(product.id, { fr: "/produits/fiche", en: "/products/detail" });
    const sources = new InMemorySourceRepository();
    await sources.createSource(COMMERCE_SOURCE);
    const provider: PublicPageProvider = {
        resolvePage: async () => null,
        listSitemapPaths: async () => ["/provider"],
    };
    const mounted = mountPublicPages({
        repository,
        sources,
        providers: [provider],
        sitemapStore: new InMemoryCmsFilesBlob(),
        sourceInterceptor: async () => Response.json({ items: [{ slug: "oak & chair" }], total: 1 }),
    });

    const result = await materializeSitemapSnapshot(mounted.delivery);
    expect(result.snapshot.chunks.map(({ language, urlCount }) => [language, urlCount])).toEqual([
        ["fr", 2],
        ["en", 2],
        [null, 1],
    ]);
    const index = await SitemapServer(new Request("https://example.test/sitemap.xml"), mounted.delivery);
    const indexXml = await index.text();
    const xmlByLanguage = new Map<string | null, string>();
    for (const chunk of result.snapshot.chunks) {
        const path = sitemapChunkPath(result.snapshot.id, chunk.index, chunk.language);
        expect(indexXml).toContain(`<loc>https://example.test${path}</loc>`);
        const response = await mounted.get(new Request(`https://example.test${path}`));
        expect(response.status).toBe(200);
        xmlByLanguage.set(chunk.language ?? null, new TextDecoder().decode(gunzipSync(await response.arrayBuffer())));
    }
    const wrongGroup = await mounted.get(
        new Request(`https://example.test/sitemap-lang-en.${result.snapshot.id}.1.xml.gz`),
    );
    expect(wrongGroup.status).toBe(404);
    const french = xmlByLanguage.get("fr")!;
    const english = xmlByLanguage.get("en")!;
    const common = xmlByLanguage.get(null)!;
    expect(french).toContain("<loc>https://example.test/a-propos</loc>");
    expect(french).toContain("<loc>https://example.test/produits/fiche?product=oak+%26+chair</loc>");
    expect(french).not.toContain("<loc>https://example.test/en/about</loc>");
    expect(english).toContain("<loc>https://example.test/en/about</loc>");
    expect(english).toContain("<loc>https://example.test/en/products/detail?product=oak+%26+chair</loc>");
    expect(english).not.toContain("<loc>https://example.test/a-propos</loc>");
    expect(common).toContain("<loc>https://example.test/provider</loc>");
    expect(common).not.toContain("hreflang=");
    for (const xml of [french, english]) {
        expect(xml).toContain('hreflang="fr" href="https://example.test/a-propos"');
        expect(xml).toContain('hreflang="en" href="https://example.test/en/about"');
        expect(xml).toContain('hreflang="fr" href="https://example.test/produits/fiche?product=oak+%26+chair"');
        expect(xml).toContain('hreflang="en" href="https://example.test/en/products/detail?product=oak+%26+chair"');
    }

    await repository.updateSystem({ site: { activeLanguages: [] } as never });
    const updated = await materializeSitemapSnapshot(mounted.delivery);
    expect(updated.snapshot.chunks.map(({ language }) => language)).toEqual(["fr", null]);
});

test("sitemap snapshots can be read for a valid long language tag", async () => {
    const language = `en-x-${Array(15).fill("abcdefg").join("-")}`;
    expect(Intl.getCanonicalLocales(language)[0]).toBe(language);
    expect(
        validateSettingsPatch({ site: { additionalLanguages: [language] } as never }).site?.additionalLanguages,
    ).toContain(language);
    const repository = new InMemoryCmsRepository();
    await repository.updateSystem({
        site: {
            host: "https://example.test",
            language: "fr",
            additionalLanguages: [language],
            activeLanguages: [language],
        } as never,
    });
    await repository.insertPage("/about", "About");
    const page = (await repository.getPage("/about"))!;
    await repository.updatePage({ id: page.id, visible: true });
    await repository.setPagePaths(page.id, { fr: "/about", [language]: "/about" });
    const store = new InMemoryCmsFilesBlob();
    const mounted = mountPublicPages({ repository, sitemapStore: store });

    const generated = await materializeSitemapSnapshot(mounted.delivery);
    const snapshot = (await readSitemapManifest(store))?.snapshots[0];
    expect(snapshot?.chunks.some((chunk) => chunk.language === language)).toBe(true);
    const chunk = generated.snapshot.chunks.find((entry) => entry.language === language)!;
    const path = sitemapChunkPath(generated.snapshot.id, chunk.index, language);
    const index = await SitemapServer(new Request("https://example.test/sitemap.xml"), mounted.delivery);
    expect(index.status).toBe(200);
    expect(await index.text()).toContain(`https://example.test${path}`);
    expect((await mounted.get(new Request(`https://example.test${path}`))).status).toBe(200);
});
