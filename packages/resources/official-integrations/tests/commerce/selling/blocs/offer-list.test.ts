import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
    activeFilterParams,
    activeMetadataFilters,
    readFilterParams,
    readMetadataFilters,
    schemaFiltersPending,
    validIdentifier,
} from "../../../../integrations/domains/commerce/versions/1.0.0/blocs/commerce-offer-list/helpers";
import { syncOfferListPresentation } from "../../../../integrations/domains/commerce/versions/1.0.0/blocs/commerce-offer-list/presentation";

describe("Commerce public offer list filters", () => {
    test("binds the public price precision policy on every preview", async () => {
        const defaultContent = await Bun.file(
            resolve(
                import.meta.dir,
                "../../../../integrations/domains/commerce/versions/1.0.0/blocs/commerce-offer-list/default.html",
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
        const params = new URLSearchParams("category=&brand=head&sort=");

        expect(activeFilterParams(filters, params)).toEqual([["brand", "head"]]);
    });

    test("only accepts aliases supported by the Source grammar", () => {
        expect(validIdentifier("offerData")).toBe("offerData");
        expect(validIdentifier("offer-data")).toBe("");
    });

    test("does not wait for an explicitly disabled schema panel", () => {
        const host = document.createElement("section");
        host.innerHTML = '<custom-filter data-commerce-offer-filter schema-driven="false"></custom-filter>';

        expect(schemaFiltersPending(host, "sports/tennis", new URLSearchParams("filter_weight:gte=300"))).toBe(false);
    });

    test("serializes numeric metadata as JSON numbers and omits empty values", () => {
        const filters = [
            { field: "weight", operator: "gte", urlParam: "weightMin", valueType: "number" },
            { field: "weight", operator: "lte", urlParam: "weightMax", valueType: "number" },
            { field: "grip_size", operator: "eq", urlParam: "gripSize", valueType: "string" },
            { field: "balance", operator: "lte", urlParam: "balanceMax", valueType: "number" },
        ];
        const params = new URLSearchParams("weightMin=295&weightMax=315&gripSize=&balanceMax=invalid");

        expect(activeMetadataFilters(filters, params)).toEqual({ weight: { gte: 295, lte: 315 } });
    });

    test("serializes boolean metadata as JSON booleans and rejects ambiguous values", () => {
        const filters = [
            { field: "is_junior", operator: "eq", urlParam: "junior", valueType: "boolean" },
            { field: "is_signed", operator: "eq", urlParam: "signed", valueType: "boolean" },
            { field: "is_limited", operator: "eq", urlParam: "limited", valueType: "boolean" },
        ];
        const params = new URLSearchParams("junior=true&signed=false&limited=yes");

        expect(activeMetadataFilters(filters, params)).toEqual({
            is_junior: { eq: true },
            is_signed: { eq: false },
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
                field="weight"
                operator="gte"
                value-type="number"
            >
                <input type="hidden" cms-param-sync="filter_weight:gte">
            </custom-offer-filter>
        `;

        expect(readMetadataFilters(host)).toEqual([
            {
                field: "weight",
                operator: "gte",
                urlParam: "filter_weight:gte",
                valueType: "number",
            },
        ]);
    });

    test("uses stable defaults for a sparse catalogue grid", () => {
        const host = document.createElement("section");
        host.innerHTML = `
            <basic-grid data-offers-grid>
                <commerce-offer-preview data-offer-card></commerce-offer-preview>
            </basic-grid>
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
            <basic-grid data-offers-grid></basic-grid>
            <basic-grid data-offers-grid>
                <commerce-offer-preview data-offer-card></commerce-offer-preview>
            </basic-grid>
            <basic-grid data-authored-grid></basic-grid>
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
