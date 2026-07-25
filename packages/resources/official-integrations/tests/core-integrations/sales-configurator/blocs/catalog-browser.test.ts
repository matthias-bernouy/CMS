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

        const table = core.querySelector<HTMLTableElement>("[data-sales-catalog-table]")!;
        const scrollRegion = core.querySelector<HTMLElement>("[data-sales-catalog-table-scroll]")!;
        const headings = Array.from(table.querySelectorAll("th"), (heading) => heading.textContent?.trim());
        const rows = table.querySelectorAll<HTMLTableRowElement>("[data-sales-catalog-row]");

        expect(requested).toHaveLength(1);
        expect(new URL(requested[0]!, "http://localhost").pathname).toEndWith("/getPartnerCatalog");
        expect(table.localName).toBe("table");
        expect(headings).toEqual(["Type", "Service", "Provider", "Disponibilité", "Prix", "Prérequis"]);
        expect(table.querySelectorAll('th[scope="col"]')).toHaveLength(6);
        expect(table.querySelectorAll("[data-sales-catalog-cell]")).toHaveLength(24);
        expect(scrollRegion.getAttribute("role")).toBe("region");
        expect(scrollRegion.getAttribute("tabindex")).toBe("0");
        expect(scrollRegion.getAttribute("style")).toContain("overflow-x: auto");
        expect(core.textContent).toContain("Variante");
        expect(core.textContent).toContain("Sélectionnable");
        expect(core.textContent).toContain("Incluse");
        expect(core.textContent).toContain("Optionnelle");
        expect(core.textContent).toContain("Identité client");
        expect(core.textContent).toContain("Sur devis");
        expect(core.textContent).toContain("Inclus");
        expect(core.textContent).toContain("125");
        expect(rows[3]?.querySelector<HTMLElement>("[data-sales-catalog-service]")?.style.paddingInlineStart).toBe(
            "2.5rem",
        );
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

        setControlValue(query, "identite", "input");
        expect(visibleRows(core)).toHaveLength(2);

        setControlValue(query, "HelpCo", "input");
        expect(visibleRows(core)).toHaveLength(1);
        expect(visibleRows(core)[0]?.textContent).toContain("Support prioritaire");

        setControlValue(status, "included", "change");
        expect(visibleRows(core)).toHaveLength(0);
        expect(filteredEmpty.hasAttribute("hidden")).toBe(false);

        setControlValue(query, "", "input");
        expect(visibleRows(core)).toHaveLength(1);
        expect(visibleRows(core)[0]?.textContent).toContain("Audit inclus");
        expect(filteredEmpty.hasAttribute("hidden")).toBe(true);
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
