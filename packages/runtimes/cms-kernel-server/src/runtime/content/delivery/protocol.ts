import type { ContentTextSource, PageRenderInputs } from "@bernouy/cms-content/rendering";
import { parseDeliveryValue, type DeliveredPageRenderInputs as Projection } from "@bernouy/cms-content/delivery";

export class ContentDeliveryError extends Error {
    constructor(operation: string, status: number) {
        super(`Content delivery rejected ${operation} (${status})`);
        this.name = "ContentDeliveryError";
    }
}
export type DeliveredPageRenderInputs = PageRenderInputs & Pick<Projection, "blocViews" | "collectionAssets">;

export function decodePageRenderInputs(value: unknown): DeliveredPageRenderInputs {
    const { texts, ...inputs } = parseDeliveryValue("content.page-render-inputs", value);
    const contentTexts: ContentTextSource[] = texts.sources.map((source) => ({
        namespace: source.namespace,
        resolve: (locale) => source.catalogues[locale] ?? source.catalogues[texts.defaultLocale] ?? {},
    }));
    return { ...inputs, contentTexts };
}
