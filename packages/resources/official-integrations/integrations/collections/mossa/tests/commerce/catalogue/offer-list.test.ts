import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
    activeFilterParams,
    activeMetadataFilters,
    readFilterParams,
    readMetadataFilters,
    schemaFiltersPending,
    validIdentifier,
} from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/commerce/offers/catalogue/commerce-offer-list/helpers.ts";
import { syncOfferListPresentation } from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/commerce/offers/catalogue/commerce-offer-list/presentation.ts";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("Commerce public offer list filters", () => {
    test("binds the public price precision policy on every preview", async () => {
        const defaultContent = await Bun.file(
            resolve(
                OFFICIAL_INTEGRATIONS_ROOT,
                "collections/mossa/blocs/domains/commerce/offers/catalogue/commerce-offer-list/default.html",
            ),
        ).text();

        expect(defaultContent).toContain('whole-unit-prices="{{ data.wholeUnitPrices }}"');
    });

    test("only serializes non-empty endpoint filters", () => {
        const filters = [
            ["category", "category"],
            ["brand", "brand"],
            ["sort", "sort"],
        ];
        const params = new URLSearchParams("category=&brand=brand-a&sort=");

        expect(activeFilterParams(filters, params)).toEqual([["brand", "brand-a"]]);
    });

    test("only accepts aliases supported by the Source grammar", () => {
        expect(validIdentifier("offerData")).toBe("offerData");
        expect(validIdentifier("offer-data")).toBe("");
    });

    test("does not wait for an explicitly disabled schema panel", () => {
        const host = document.createElement("section");
        host.innerHTML = '<custom-filter data-commerce-offer-filter schema-driven="false"></custom-filter>';

        expect(
            schemaFiltersPending(host, "catalog/primary", new URLSearchParams("filter_numeric_attribute:gte=300")),
        ).toBe(false);
    });

    test("serializes numeric metadata as JSON numbers and omits empty values", () => {
        const filters = [
            { field: "numeric_attribute", operator: "gte", urlParam: "numericMin", valueType: "number" },
            { field: "numeric_attribute", operator: "lte", urlParam: "numericMax", valueType: "number" },
            { field: "text_attribute", operator: "eq", urlParam: "textValue", valueType: "string" },
            { field: "other_numeric_attribute", operator: "lte", urlParam: "otherMaximum", valueType: "number" },
        ];
        const params = new URLSearchParams("numericMin=295&numericMax=315&textValue=&otherMaximum=invalid");

        expect(activeMetadataFilters(filters, params)).toEqual({ numeric_attribute: { gte: 295, lte: 315 } });
    });

    test("serializes boolean metadata as JSON booleans and rejects ambiguous values", () => {
        const filters = [
            { field: "enabled_flag", operator: "eq", urlParam: "enabled", valueType: "boolean" },
            { field: "disabled_flag", operator: "eq", urlParam: "disabled", valueType: "boolean" },
            { field: "ambiguous_flag", operator: "eq", urlParam: "ambiguous", valueType: "boolean" },
        ];
        const params = new URLSearchParams("enabled=true&disabled=false&ambiguous=yes");

        expect(activeMetadataFilters(filters, params)).toEqual({
            enabled_flag: { eq: true },
            disabled_flag: { eq: false },
        });
    });

    test("discovers an explicit category parameter declaration", () => {
        const attributes = new Map([
            ["data-commerce-param", "category"],
            ["data-url-param", "category"],
        ]);
        const control = { getAttribute: (name) => attributes.get(name) ?? null };
        const host = { querySelectorAll: () => [control] };

        expect(readFilterParams(host)).toEqual([["category", "category"]]);
    });

    test("discovers metadata controls when the filter bloc uses an installation alias", () => {
        const host = document.createElement("section");
        host.innerHTML = `
            <custom-offer-filter
                data-commerce-offer-filter
                field="numeric_attribute"
                operator="gte"
                value-type="number"
            >
                <input type="hidden" cms-param-sync="filter_numeric_attribute:gte">
            </custom-offer-filter>
        `;

        expect(readMetadataFilters(host)).toEqual([
            {
                field: "numeric_attribute",
                operator: "gte",
                urlParam: "filter_numeric_attribute:gte",
                valueType: "number",
            },
        ]);
    });

    test("uses stable defaults for a sparse catalogue grid", () => {
        const host = document.createElement("section");
        host.innerHTML = `
            <mossa-responsive-grid data-offers-grid>
                <mossa-commerce-offer-preview data-offer-card></mossa-commerce-offer-preview>
            </mossa-responsive-grid>
        `;

        syncOfferListPresentation(host);

        const grid = host.querySelector("[data-offers-grid]");
        expect(grid?.getAttribute("min")).toBe("md");
        expect(grid?.getAttribute("max")).toBe("lg");
        expect(grid?.getAttribute("gap")).toBe("md");
        expect(grid?.getAttribute("packing")).toBe("fill");
        expect(grid?.getAttribute("justify-items")).toBe("stretch");
        expect(host.querySelector("[data-offer-card]")?.hasAttribute("stretch")).toBeTrue();
    });

    test("synchronizes the catalogue grid and card stretch settings", () => {
        const host = document.createElement("section");
        host.setAttribute("grid-min", "sm");
        host.setAttribute("grid-max", "lg");
        host.setAttribute("grid-gap", "xl");
        host.setAttribute("grid-packing", "fill");
        host.innerHTML = `
            <mossa-responsive-grid data-offers-grid></mossa-responsive-grid>
            <mossa-responsive-grid data-offers-grid>
                <mossa-commerce-offer-preview data-offer-card></mossa-commerce-offer-preview>
            </mossa-responsive-grid>
            <mossa-responsive-grid data-authored-grid></mossa-responsive-grid>
        `;

        syncOfferListPresentation(host);

        for (const grid of host.querySelectorAll("[data-offers-grid]")) {
            expect(grid.getAttribute("min")).toBe("sm");
            expect(grid.getAttribute("max")).toBe("lg");
            expect(grid.getAttribute("gap")).toBe("xl");
            expect(grid.getAttribute("packing")).toBe("fill");
            expect(grid.getAttribute("justify-items")).toBe("stretch");
        }
        expect(host.querySelector("[data-authored-grid]")?.hasAttribute("min")).toBeFalse();

        const card = host.querySelector("[data-offer-card]");
        expect(card?.hasAttribute("stretch")).toBeTrue();
        host.setAttribute("card-stretch", "false");
        syncOfferListPresentation(host);
        expect(card?.hasAttribute("stretch")).toBeFalse();
    });
});
