import type { Source, SourceEndpoint } from "@bernouy/cms-sources";

const endpoint = (endpointId: string, inputParams: string[] = []): SourceEndpoint => ({
    urn: `urn:products:${endpointId}`,
    method: "GET",
    targetUrl: `https://example.com/${endpointId}`,
    input: {
        params: inputParams.map((name) => ({ name, in: "query", schema: { type: "string" } })),
    },
});

export const productSource: Source = {
    urn: "urn:products",
    endpoints: [
        endpoint("listProducts", ["q", "status"]),
        endpoint("getProduct", ["productId"]),
        endpoint("updateProduct", ["productId"]),
        endpoint("deleteProduct", ["productId"]),
        endpoint("searchBrands", ["q"]),
        endpoint("createBrand"),
        endpoint("uploadProductImage", ["productId"]),
        endpoint("removeProductImage", ["productId", "mediaId"]),
        endpoint("reorderProductImages", ["productId"]),
    ],
};
