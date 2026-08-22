import type { TPage } from "@bernouy/cms-content";
import { InMemoryRolesRepository, PUBLIC_ROLE } from "@bernouy/cms-permissions";
import type { Source } from "@bernouy/cms-sources";

export const COMMERCE_SOURCE: Source = {
    urn: "urn:commerce",
    endpoints: [
        {
            urn: "urn:commerce:product",
            method: "GET",
            access: { mode: "public" },
            targetUrl: "https://commerce.test/product",
            input: {
                params: [{ name: "slug", in: "query", required: true, schema: { type: "string" } }],
            },
        },
        {
            urn: "urn:commerce:products",
            method: "GET",
            access: { mode: "public" },
            targetUrl: "https://commerce.test/products",
        },
    ],
    indexing: {
        entities: [
            {
                id: "product-by-slug",
                label: "Product",
                resolve: {
                    endpointUrn: "urn:commerce:product",
                    identity: { key: "slug", inputParam: "slug", outputPath: "slug" },
                },
                discover: {
                    endpointUrn: "urn:commerce:products",
                    itemsPath: "items",
                    identityPath: "slug",
                },
                variables: {
                    description: { path: "description", type: "text" },
                    title: { path: "title", type: "text" },
                },
            },
        ],
    },
};

export const PRODUCT_PAGE = {
    id: "product-detail",
    path: "/products/detail",
    title: "${content.title} — ${site.name}",
    description: "${content.description}",
    content: '<main cms-source="/.cms/sources/commerce/product?slug=#{product}"></main>',
    visible: true,
    tags: [],
    indexing: {
        enabled: true,
        entity: {
            sourceUrn: "urn:commerce",
            entityId: "product-by-slug",
            pageQueryParam: "product",
        },
    },
} satisfies TPage;

export async function commercePublicRoles(): Promise<InMemoryRolesRepository> {
    const roles = new InMemoryRolesRepository();
    await roles.upsert({
        id: PUBLIC_ROLE,
        label: "Public",
        builtin: true,
        grants: [{ permission: "urn:commerce:product" }],
    });
    return roles;
}
