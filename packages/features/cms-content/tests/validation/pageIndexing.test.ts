import { describe, expect, test } from "bun:test";
import { ContentValidationError, validatePageIndexingConfiguration, validatePagePatch } from "@bernouy/cms-content";

describe("page indexing configuration", () => {
    test("preserves an explicit disabled choice", () => {
        expect(validatePageIndexingConfiguration({ mode: "disabled", sourceUrn: "ignored" })).toEqual({
            mode: "disabled",
        });
    });

    test("normalizes an entity selection and its SEO templates", () => {
        expect(
            validatePageIndexingConfiguration({
                mode: "entity",
                sourceUrn: "  urn:commerce  ",
                entityId: "  product-by-slug  ",
                pageQueryParam: "  product  ",
                titleTemplate: "  Buy {{ title }}  ",
                descriptionTemplate: "   ",
            }),
        ).toEqual({
            mode: "entity",
            sourceUrn: "urn:commerce",
            entityId: "product-by-slug",
            pageQueryParam: "product",
            titleTemplate: "Buy {{ title }}",
        });
    });

    test.each([
        null,
        {},
        { mode: "automatic" },
        { mode: "entity", sourceUrn: "commerce", entityId: "product", pageQueryParam: "product" },
        { mode: "entity", sourceUrn: "urn:commerce", entityId: "", pageQueryParam: "product" },
        { mode: "entity", sourceUrn: "urn:commerce", entityId: "product", pageQueryParam: "bad param" },
    ])("rejects an invalid configuration: %p", (configuration) => {
        expect(() => validatePageIndexingConfiguration(configuration)).toThrow(ContentValidationError);
    });

    test("normalizes indexing as part of a page patch", () => {
        expect(
            validatePagePatch({
                indexing: {
                    mode: "entity",
                    sourceUrn: "urn:commerce",
                    entityId: " product-by-id ",
                    pageQueryParam: "product",
                },
            }),
        ).toEqual({
            indexing: {
                mode: "entity",
                sourceUrn: "urn:commerce",
                entityId: "product-by-id",
                pageQueryParam: "product",
            },
        });
    });
});
