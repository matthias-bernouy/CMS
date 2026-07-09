import type {
    CmsRelation,
    DashboardRelationProjection,
} from "@bernouy/cms-relations";
import type { Source } from "@bernouy/cms-sources";

export function productOffersRelation(): CmsRelation {
    return {
        id: "product-offers",
        label: "Offers",
        from: { sourceId: "products", idPath: "id" },
        to: { sourceId: "offers", idPath: "id" },
        cardinality: "many",
        binding: {
            kind: "reference",
            endpoint: { sourceId: "offers", endpointId: "offers" },
            params: { productId: "$from.id" },
        },
        page: {
            itemsPath: "items",
            totalPath: "total",
            limitParam: "limit",
            offsetParam: "offset",
            defaultLimit: 25,
            maxLimit: 100,
        },
    };
}

export function productOffersProjection(): DashboardRelationProjection {
    return {
        type: "dashboardRelation",
        relationId: "product-offers",
        dashboardId: "products-products",
        viewId: "productDetail",
        widget: "table",
        title: "Offers",
        pageSize: 25,
        rowKey: "id",
        columns: [{ id: "title", label: "Offer", path: "title", primary: true }],
    };
}

export function offersSource(): Source {
    return {
        urn: "urn:offers",
        meta: { name: "Offers" },
        endpoints: [{
            urn: "urn:offers:offers",
            method: "GET",
            access: { mode: "public" },
            targetUrl: "https://api.example.com/offers",
            input: {
                params: [
                    { name: "productId", in: "query", schema: { type: "string" } },
                    { name: "limit", in: "query", schema: { type: "number" } },
                    { name: "offset", in: "query", schema: { type: "number" } },
                ],
            },
        }],
    };
}
