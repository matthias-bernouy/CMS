import type { Source, SourceEndpoint } from "cms-sources/interfaces/Source";

export const ep = (urn: string, targetUrl = "https://api.shop.com/x"): SourceEndpoint => ({
    urn,
    method: "GET",
    targetUrl,
});

export const source = (over: Partial<Source> = {}): Source => ({
    urn: "urn:shop",
    endpoints: [ep("urn:shop:getCart")],
    ...over,
});
