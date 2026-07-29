import type { DashboardSection, DashboardWidget } from "@bernouy/cms-dashboards";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const variantsSectionPath = resolve(
    import.meta.dir,
    "../../../../resources/official-integrations/integrations/domains/commerce/versions/1.0.0/definitions/artifacts/dashboards/products/views/product-detail/sections/product-variants.json",
);

export async function variantsWidgetFixture(): Promise<Extract<DashboardWidget, { widget: "w-detail" }>> {
    const section = JSON.parse(await readFile(variantsSectionPath, "utf8")) as DashboardSection;
    return {
        widget: "w-detail",
        id: "productDetail",
        source: { endpoint: "product" },
        title: { path: "title", fallback: "Product" },
        main: [section],
    };
}

export const variantsResource = {
    title: "Racket",
    variantAxes: [{ fieldKey: "model-year", values: [] }],
    variantMatrix: [],
};
