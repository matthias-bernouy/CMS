import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { Bloc as ValuationBloc } from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/commerce/offers/catalogue/valuation/Bloc.ts";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

const TAG = "mossa-valuation-regression-test";

describe("Commerce catalogue valuation", () => {
    test("keeps every static and state message in authored slots", async () => {
        const root = resolve(
            OFFICIAL_INTEGRATIONS_ROOT,
            "collections/mossa/blocs/domains/commerce/offers/catalogue/valuation",
        );
        const [source, template, defaultContent, editor] = await Promise.all([
            Bun.file(resolve(root, "Bloc.ts")).text(),
            Bun.file(resolve(root, "template.html")).text(),
            Bun.file(resolve(root, "default.html")).text(),
            Bun.file(resolve(root, "BlocEditor.ts")).text(),
        ]);

        for (const slot of ["heading-title", "searching-message", "selected-model-message", "range-description"]) {
            expect(template).toContain(`slot name="${slot}"`);
            expect(defaultContent).toContain(`slot="${slot}"`);
            expect(editor).toContain(`"${slot}"`);
        }
        expect(source).not.toContain("valuationCopy");
        expect(source).not.toContain('getAttribute("locale")');
    });

    test("reveals the result selected from the catalogue instead of the outer shell", () => {
        if (!customElements.get(TAG)) {
            customElements.define(TAG, ValuationBloc);
        }
        const valuation = document.createElement(TAG) as ValuationBloc;
        document.body.append(valuation);
        const input = document.createElement("input");
        const selectable = valuation as unknown as {
            input: HTMLInputElement;
            selectProduct(product: {
                id: number;
                title: string;
                description: string;
                metadata: Record<string, number>;
            }): void;
        };
        selectable.input = input;

        selectable.selectProduct({
            id: 1,
            title: "Generic product",
            description: "Reusable catalogue product",
            metadata: { valuationMinimum: 120, valuationMaximum: 155 },
        });

        const result = valuation.shadowRoot?.querySelector<HTMLElement>("[data-valuation-result]");
        expect(result?.hidden).toBe(false);
        expect(valuation.shadowRoot?.querySelector("[data-estimate]")?.textContent).toContain("120");
        expect(valuation.shadowRoot?.querySelector("[data-estimate]")?.textContent).toContain("155");
        expect(valuation.shadowRoot?.querySelector(".initial-state")?.hasAttribute("hidden")).toBe(true);
    });
});
