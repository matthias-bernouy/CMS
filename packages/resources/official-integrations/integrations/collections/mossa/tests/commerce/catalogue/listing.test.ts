import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { resetListingFilters } from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/commerce/offers/catalogue/listing/Bloc.ts";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("Commerce catalogue listing", () => {
    test("keeps visible and accessible drawer copy in authored slots", async () => {
        const root = resolve(
            OFFICIAL_INTEGRATIONS_ROOT,
            "collections/mossa/blocs/domains/commerce/offers/catalogue/listing",
        );
        const [template, defaultContent, editor] = await Promise.all([
            Bun.file(resolve(root, "template.html")).text(),
            Bun.file(resolve(root, "default.html")).text(),
            Bun.file(resolve(root, "BlocEditor.ts")).text(),
        ]);

        expect(template).toContain('<slot name="filters-label"></slot>');
        expect(template).toContain('<slot name="close-filters-label"></slot>');
        expect(defaultContent).toContain('slot="filters-label"');
        expect(defaultContent).toContain('slot="close-filters-label"');
        expect(editor).toContain('slot: "filters-label"');
        expect(editor).toContain('slot: "close-filters-label"');
        expect(template).not.toContain(">Filters<");
    });

    test("resets filters without resetting explicitly excluded URL controls", () => {
        const listing = document.createElement("section");
        listing.innerHTML = `
            <input cms-param-sync="brand" value="Wilson">
            <input cms-param-sync="sort" data-filter-reset="false" value="price-asc">
            <input data-filter-reset value="75">
            <mossa-category-filters></mossa-category-filters>
        `;
        let categoryResets = 0;
        listing.querySelector("mossa-category-filters")?.addEventListener("category-filters-reset", () => {
            categoryResets += 1;
        });

        resetListingFilters(listing);

        expect((listing.querySelector('[cms-param-sync="brand"]') as HTMLInputElement).value).toBe("");
        expect((listing.querySelector('[cms-param-sync="sort"]') as HTMLInputElement).value).toBe("price-asc");
        expect(
            (listing.querySelector('[data-filter-reset]:not([data-filter-reset="false"])') as HTMLInputElement).value,
        ).toBe("");
        expect(categoryResets).toBe(1);
    });
});
