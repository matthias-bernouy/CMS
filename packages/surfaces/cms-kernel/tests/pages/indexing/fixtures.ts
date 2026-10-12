import type { TPage } from "@bernouy/cms-content";

export const PRODUCT_PAGE = {
    id: "product-detail",
    path: "/products/detail",
    title: "${content.title} — ${site.name}",
    description: "${content.description}",
    content: `<main cms-source="/.cms/call/commerce/product.get" cms-source-method="POST" cms-source-body='{"slug":{"from":"queryParam","name":"product"}}'></main>`,
    visible: true,
    tags: [],
    indexing: {
        enabled: true,
        entity: {
            contractId: "commerce",
            label: "Product",
            pageQueryParam: "product",
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
