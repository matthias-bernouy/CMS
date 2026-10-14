import type { TPage } from "@bernouy/cms-content";

export const PRODUCT_PAGE = {
    id: "product-detail",
    path: "/products/detail",
    title: "${content.title} — ${site.name}",
    description: "${content.description}",
    content: `<main cms-query="commerce:product.get as product" cms-query-input='{"slug":{"from":"sync","key":"@param:site-product"}}'></main>`,
    visible: true,
    tags: [],
    indexing: {
        enabled: true,
        entity: {
            contractId: "commerce",
            label: "Product",
            pageQueryParam: "site-product",
            resolve: { capabilityId: "product.get", inputParam: "slug", identityPath: "slug" },
            discover: {
                capabilityId: "product.list",
                itemsPath: "items",
                identityPath: "slug",
                lastModifiedPath: "updatedAt",
                pagination: {
                    type: "offset",
                    limitParam: "limit",
                    offsetParam: "offset",
                    pageSize: 2,
                    totalPath: "total",
                },
            },
            variables: {
                description: { path: "description", type: "text" },
                title: { path: "title", type: "text" },
            },
        },
    },
} satisfies TPage;
