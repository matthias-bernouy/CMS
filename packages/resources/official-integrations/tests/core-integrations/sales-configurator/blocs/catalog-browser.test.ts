import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { BindingCore, BINDING_CORE_TAG } from "@bernouy/components/binding";
import { defineBloc, readBlocFile, settle, waitFor } from "./harness";

const tag = "test-sales-catalog-browser";
const realFetch = globalThis.fetch;

beforeAll(async () => {
    if (!customElements.get(BINDING_CORE_TAG)) {
        customElements.define(BINDING_CORE_TAG, BindingCore);
    }
    await defineBloc("sales-catalog-browser", tag);
});

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("sales catalog browser", () => {
    test("renders the flat catalog in one accessible native table", async () => {
        const requested: string[] = [];
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            requested.push(String(input));
            return Response.json(catalogFixture());
        }) as typeof fetch;

        const core = document.createElement(BINDING_CORE_TAG);
        core.innerHTML = (await readBlocFile("sales-catalog-browser", "default.html")).replaceAll(
            "sales-catalog-browser",
            tag,
        );
        document.body.append(core);

        await waitFor(() => core.querySelectorAll("[data-sales-catalog-row]").length === 4);
        await waitFor(() => core.textContent?.includes("Support prioritaire") === true);

        const table = core.querySelector<HTMLTableElement>(".sales-catalog-table")!;
        const scrollRegion = core.querySelector<HTMLElement>(".sales-catalog-table-scroll")!;
        const headings = Array.from(table.querySelectorAll("thead th"), (heading) => heading.textContent?.trim());
        const rows = table.querySelectorAll<HTMLTableRowElement>("[data-sales-catalog-row]");
        const moduleToggle = rows[0]?.querySelector<HTMLButtonElement>("[data-sales-module-toggle]")!;
        const resultCount = core.querySelector<HTMLOutputElement>("[data-sales-catalog-result-count]")!;

        expect(requested).toHaveLength(1);
        expect(new URL(requested[0]!, "http://localhost").pathname).toEndWith("/getPartnerCatalog");
        expect(table.localName).toBe("table");
        expect(headings).toEqual(["Service", "Provider", "Prix", "Prérequis"]);
        expect(table.querySelectorAll('th[scope="col"]')).toHaveLength(4);
        expect(table.querySelectorAll('th[scope="row"]')).toHaveLength(4);
        expect(table.querySelectorAll(".sales-catalog-cell")).toHaveLength(16);
        expect(table.querySelectorAll(".sales-price-cell")).toHaveLength(4);
        expect(scrollRegion.getAttribute("role")).toBe("region");
        expect(scrollRegion.getAttribute("tabindex")).toBe("0");
        expect(rows[0]?.hasAttribute("data-sales-expanded")).toBe(false);
        expect(visibleRows(core)).toEqual([rows[0]]);
        expect(moduleToggle.localName).toBe("button");
        expect(moduleToggle.getAttribute("data-sales-collapsed-label")).toBe("Afficher");
        expect(moduleToggle.getAttribute("data-sales-expanded-label")).toBe("Réduire");
        expect(moduleToggle.getAttribute("aria-expanded")).toBe("false");
        expect(moduleToggle.hidden).toBe(false);
        expect(resultCount.textContent).toBe("1 service affiché");
        expect(rows[0]?.querySelector("[data-sales-module-counts]")?.textContent).toBe(
            "1 variante · 2 fonctionnalités",
        );
        expect(Array.from(rows, (row) => row.getAttribute("data-sales-row-kind"))).toEqual([
            "module",
            "variant",
            "feature",
            "feature",
        ]);
        expect(Array.from(rows, (row) => row.hasAttribute("data-sales-depth"))).toEqual([false, false, false, false]);
        expect(table.querySelectorAll(".sales-kind-badge")).toHaveLength(4);
        expect(table.querySelectorAll(".sales-availability-badge")).toHaveLength(4);
        expect(core.textContent).toContain("Variante");
        expect(core.textContent).toContain("Sélectionnable");
        expect(core.textContent).toContain("Incluse");
        expect(core.textContent).toContain("Optionnelle");
        expect(core.textContent).toContain("Identité client");
        expect(core.textContent).toContain("Sur devis");
        expect(core.textContent).toContain("Inclus");
        expect(core.textContent).toContain("125");
        moduleToggle.click();
        expect(visibleRows(core)).toHaveLength(4);
        expect(rows[0]?.hasAttribute("data-sales-expanded")).toBe(false);
        expect(moduleToggle.getAttribute("aria-expanded")).toBe("true");
        expect(moduleToggle.textContent).toContain("Réduire");
        expect(resultCount.textContent).toBe("4 services affichés");

        await settle();
        const browser = core.querySelector<HTMLElement & { syncPresentation: () => void }>(tag)!;
        const syncPresentation = browser.syncPresentation.bind(browser);
        let presentationSyncs = 0;
        browser.syncPresentation = () => {
            presentationSyncs += 1;
            syncPresentation();
        };
        table.querySelector<HTMLElement>("[data-sales-money]")!.textContent = "125 €";
        await settle();
        expect(presentationSyncs).toBe(0);
    });

    test("filters rendered rows locally without another source request", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            return Response.json(catalogFixture());
        }) as typeof fetch;

        const core = document.createElement(BINDING_CORE_TAG);
        core.innerHTML = (await readBlocFile("sales-catalog-browser", "default.html")).replaceAll(
            "sales-catalog-browser",
            tag,
        );
        document.body.append(core);
        await waitFor(() => core.querySelectorAll("[data-sales-catalog-row]").length === 4);

        const query = core.querySelector<HTMLElement>("[data-sales-catalog-query]")!;
        const status = core.querySelector<HTMLElement>("[data-sales-catalog-status]")!;
        const filteredEmpty = core.querySelector<HTMLElement>("[data-sales-catalog-filter-empty]")!;
        const moduleToggle = core.querySelector<HTMLButtonElement>("[data-sales-module-toggle]")!;

        moduleToggle.click();
        expect(moduleToggle.getAttribute("aria-expanded")).toBe("true");

        setControlValue(query, "identite", "input");
        expect(visibleRows(core)).toHaveLength(4);
        expect(moduleToggle.hidden).toBe(true);
        moduleToggle.click();

        setControlValue(query, "HelpCo", "input");
        expect(visibleRows(core)).toHaveLength(3);
        expect(visibleRows(core).map((row) => row.getAttribute("data-sales-row-kind"))).toEqual([
            "module",
            "variant",
            "feature",
        ]);
        expect(visibleRows(core)[2]?.textContent).toContain("Support prioritaire");

        setControlValue(status, "included", "change");
        expect(visibleRows(core)).toHaveLength(0);
        expect(filteredEmpty.hasAttribute("hidden")).toBe(false);
        expect(moduleToggle.hidden).toBe(true);

        setControlValue(query, "", "input");
        expect(visibleRows(core)).toHaveLength(3);
        expect(visibleRows(core)[2]?.textContent).toContain("Audit inclus");
        expect(filteredEmpty.hasAttribute("hidden")).toBe(true);
        setControlValue(status, "", "change");
        expect(moduleToggle.hidden).toBe(false);
        expect(moduleToggle.getAttribute("aria-expanded")).toBe("true");
        expect(visibleRows(core)).toHaveLength(4);
        expect(calls).toBe(1);
    });

    test("keeps editor-disabled forced states network-inert", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            return Response.json({});
        }) as typeof fetch;

        const core = document.createElement(BINDING_CORE_TAG);
        core.setAttribute("cms-binding-disabled", "");
        core.setAttribute("cms-source-state-force", "loaded");
        core.innerHTML = (await readBlocFile("sales-catalog-browser", "default.html")).replaceAll(
            "sales-catalog-browser",
            tag,
        );
        document.body.append(core);
        await settle();

        expect(calls).toBe(0);
    });
});

function setControlValue(control: HTMLElement, value: string, eventName: "change" | "input") {
    control.setAttribute("value", value);
    if ("value" in control) {
        (control as HTMLElement & { value: string }).value = value;
    }
    control.dispatchEvent(new Event(eventName, { bubbles: true, composed: true }));
}

function visibleRows(root: ParentNode): HTMLTableRowElement[] {
    return Array.from(root.querySelectorAll<HTMLTableRowElement>("[data-sales-catalog-row]:not([hidden])"));
}

function catalogFixture() {
    return {
        modules: [],
        selectionRows: [
            {
                kind: "module",
                typeLabel: "Module",
                depth: 0,
                id: 1,
                code: "identity",
                name: "Identité client",
                description: "Socle d’identité",
                moduleId: 1,
                variantId: null,
                providerName: null,
                availability: "base",
                availabilityLabel: "Base",
                pricingMode: null,
                unitAmountCents: null,
                currency: null,
                requirements: [],
            },
            {
                kind: "variant",
                typeLabel: "Variant",
                depth: 1,
                id: 2,
                code: "auth0",
                name: "Authentification Auth0",
                description: null,
                moduleId: 1,
                variantId: 2,
                providerName: "Auth0",
                availability: "selectable",
                availabilityLabel: "Selectable",
                pricingMode: "quote",
                unitAmountCents: null,
                currency: "EUR",
                requirements: [],
            },
            {
                kind: "feature",
                typeLabel: "Feature",
                depth: 2,
                id: 3,
                code: "audit",
                name: "Audit inclus",
                description: null,
                moduleId: 1,
                variantId: 2,
                providerName: "Auth0",
                availability: "included",
                availabilityLabel: "Included",
                pricingMode: "included",
                unitAmountCents: null,
                currency: "EUR",
                requirements: [],
            },
            {
                kind: "feature",
                typeLabel: "Feature",
                depth: 2,
                id: 4,
                code: "support",
                name: "Support prioritaire",
                description: null,
                moduleId: 1,
                variantId: 2,
                providerName: "HelpCo",
                availability: "optional",
                availabilityLabel: "Optional",
                pricingMode: "fixed",
                unitAmountCents: 12500,
                currency: "EUR",
                requirements: [
                    {
                        subjectItemId: 4,
                        subjectKind: "feature",
                        subjectCode: "support",
                        subjectName: "Support prioritaire",
                        requiredItemId: 1,
                        requiredKind: "module",
                        requiredCode: "identity",
                        requiredName: "Identité client",
                        createdAt: "2026-07-25T00:00:00.000Z",
                    },
                ],
            },
        ],
    };
}
