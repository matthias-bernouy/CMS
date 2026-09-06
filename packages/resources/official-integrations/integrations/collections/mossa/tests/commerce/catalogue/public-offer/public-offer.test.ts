import { expect, test } from "bun:test";
import { mountOffer, specificationRows } from "./harness";

test("public offers render product metadata with category labels, units and complete variant choices", async () => {
    const { host, requests, dispose } = await mountOffer();
    try {
        expect(requests).toEqual([
            "/.cms/sources/commerce/offer?slug=sample-offer",
            "/.cms/sources/commerce/product?id=21",
            "/.cms/sources/commerce/offerFilterSchema?category=equipment%2Frackets",
        ]);
        const rows = specificationRows(host);
        expect(rows).toEqual([
            ["Model", "Sample Aero Team 2023 — 285g"],
            ["Grip size", "L2"],
            ["Sport", "tennis"],
            ["Model year", "2023"],
            ["Weight", "285 g"],
            ["Head size", "645 cm²"],
            ["Balance", "320 mm"],
            ["String pattern", "16x19"],
            ["Player level", "Intermediate"],
            ["Play style", "Spin"],
            ["Balance distribution", "Head light"],
            ["Tolerance", "0 g"],
        ]);
        expect(host.shadowRoot!.querySelector("[data-valuation-value]")!.textContent).toBe("€40 – €100");
        host.setAttribute("model-label", "Product model");
        expect(specificationRows(host)).toEqual([["Product model", rows[0]![1]!], ...rows.slice(1)]);
        expect(requests).toHaveLength(3);
        expect(host.querySelector("[data-buy]")!.getAttribute("href")).toBe("/checkout?offerId=7");
        expect(host.querySelector("[data-negotiate]")!.getAttribute("href")).toBe("/negotiate?offerId=7");
    } finally {
        dispose();
    }
});

test("unavailable offers retain product details while disabling purchase and negotiation", async () => {
    const { host, dispose } = await mountOffer({ unavailable: true });
    try {
        expect(specificationRows(host)).toContainEqual(["Weight", "285 g"]);
        for (const selector of ["[data-buy]", "[data-negotiate]"]) {
            const action = host.querySelector(selector)!;
            expect(action.hasAttribute("href")).toBe(false);
            expect(action.getAttribute("aria-disabled")).toBe("true");
            expect(action.getAttribute("tabindex")).toBe("-1");
        }
    } finally {
        dispose();
    }
});

test("embedded product details remain available when the optional product lookup fails", async () => {
    const { host, dispose } = await mountOffer({ productUnavailable: true });
    try {
        expect(specificationRows(host)).toContainEqual(["Head size", "645 cm²"]);
        expect(host.shadowRoot!.querySelector<HTMLElement>("[data-error]")!.hidden).toBe(true);
        expect(host.querySelector("[data-buy]")!.getAttribute("href")).toBe("/checkout?offerId=7");
    } finally {
        dispose();
    }
});

test("explicit offer specifications remain visible when the optional schema lookup fails", async () => {
    const { host, dispose } = await mountOffer({ schemaUnavailable: true });
    try {
        expect(specificationRows(host)).toEqual([
            ["Model", "Sample Aero Team 2023 — 285g"],
            ["Grip size", "L2"],
            ["Weight", "280 g"],
        ]);
        expect(host.shadowRoot!.querySelector<HTMLElement>("[data-error]")!.hidden).toBe(true);
    } finally {
        dispose();
    }
});
