import { expect, test } from "bun:test";
import { ContentValidationError, validatePageSeo } from "@bernouy/cms-content";

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
