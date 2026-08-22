import { describe, expect, test } from "bun:test";
import { ContentValidationError, validatePageIndexingConfiguration, validatePagePatch } from "@bernouy/cms-content";

describe("page indexing configuration", () => {
    test("preserves an explicit disabled choice", () => {
        expect(validatePageIndexingConfiguration({ enabled: false, ignored: true })).toEqual({
            enabled: false,
        });
    });

    test("normalizes an optional entity selection", () => {
        expect(
            validatePageIndexingConfiguration({
                enabled: true,
                entity: {
                    sourceUrn: "  urn:commerce  ",
                    entityId: "  product-by-slug  ",
                    pageQueryParam: "  product  ",
                },
            }),
        ).toEqual({
            enabled: true,
            entity: {
                sourceUrn: "urn:commerce",
                entityId: "product-by-slug",
                pageQueryParam: "product",
            },
        });
    });

    test.each([
        null,
        {},
        { enabled: "yes" },
        { enabled: true, entity: "product" },
        { enabled: true, entity: { sourceUrn: "commerce", entityId: "product", pageQueryParam: "product" } },
        { enabled: true, entity: { sourceUrn: "urn:commerce", entityId: "", pageQueryParam: "product" } },
        {
            enabled: true,
            entity: { sourceUrn: "urn:commerce", entityId: "product", pageQueryParam: "bad param" },
        },
    ])("rejects an invalid configuration: %p", (configuration) => {
        expect(() => validatePageIndexingConfiguration(configuration)).toThrow(ContentValidationError);
    });

    test("normalizes indexing as part of a page patch", () => {
        expect(
            validatePagePatch({
                indexing: {
                    enabled: true,
                    entity: {
                        sourceUrn: "urn:commerce",
                        entityId: " product-by-id ",
                        pageQueryParam: "product",
                    },
                },
            }),
        ).toEqual({
            indexing: {
                enabled: true,
                entity: {
                    sourceUrn: "urn:commerce",
                    entityId: "product-by-id",
                    pageQueryParam: "product",
                },
            },
        });
    });
});
