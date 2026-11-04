import { expect, test } from "bun:test";
import { ContentValidationError, validatePageSeo } from "@bernouy/cms-content";
import { pageSeoForLanguage, type TPage } from "@bernouy/cms-content/rendering";

test("SEO reads use canonical keys without reading alternate stored formats", () => {
    const page = { seo: { "fr-FR": { title: "Bonjour" }, "fr-fr": { title: "Obsolete" } } } as TPage;
    expect(pageSeoForLanguage(page, "fr-fr")).toEqual({ title: "Bonjour" });
    delete page.seo!["fr-FR"];
    expect(pageSeoForLanguage(page, "fr-fr")).toBeUndefined();
    page.seo!.invalid_tag = { title: "Obsolete" };
    expect(pageSeoForLanguage(page, "invalid_tag")).toBeUndefined();
    expect(pageSeoForLanguage(page, "")).toBeUndefined();
});

test("SEO translations normalize language tags and independently inherit empty fields", () => {
    expect(
        validatePageSeo({
            EN: { title: "  About us  ", description: "  Company information  " },
            de: { title: "", description: "  Über uns  " },
            it: { title: "", description: "" },
        }),
    ).toEqual({
        en: { title: "About us", description: "Company information" },
        de: { description: "Über uns" },
    });
});

test("SEO translations reject invalid language tags and content", () => {
    for (const seo of [
        { invalid_tag: { title: "Title" } },
        { en: { title: "x".repeat(71) } },
        { en: { description: "x".repeat(201) } },
        { en: { title: 4 } },
        { en: { title: "Title", script: "bad" } },
        { en: { title: "One" }, EN: { title: "Two" } },
    ]) {
        expect(() => validatePageSeo(seo)).toThrow(ContentValidationError);
    }
});
