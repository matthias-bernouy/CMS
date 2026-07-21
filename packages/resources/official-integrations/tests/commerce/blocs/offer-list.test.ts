import { describe, expect, test } from "bun:test";
import {
    activeFilterParams,
    activeMetadataFilters,
    readFilterParams,
} from "../../../integrations/commerce/versions/1.0.0/blocs/commerce-offer-list/helpers";
import { syncOfferListPresentation } from "../../../integrations/commerce/versions/1.0.0/blocs/commerce-offer-list/presentation";

describe("Commerce public offer list filters", () => {
    test("only serializes non-empty endpoint filters", () => {
        const filters = [
            ["category", "category"],
            ["brand", "brand"],
            ["sort", "sort"],
        ];
        const params = new URLSearchParams("category=&brand=head&sort=");

        expect(activeFilterParams(filters, params)).toEqual([["brand", "head"]]);
    });

    test("serializes numeric metadata as JSON numbers and omits empty values", () => {
        const filters = [
            { field: "weight", operator: "lte", urlParam: "weightMax", valueType: "number" },
            { field: "grip_size", operator: "eq", urlParam: "gripSize", valueType: "string" },
            { field: "balance", operator: "lte", urlParam: "balanceMax", valueType: "number" },
        ];
        const params = new URLSearchParams("weightMax=315&gripSize=&balanceMax=invalid");

        expect(activeMetadataFilters(filters, params)).toEqual({ weight: { lte: 315 } });
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
