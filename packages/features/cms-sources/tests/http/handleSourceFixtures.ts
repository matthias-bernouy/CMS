import { mock } from "bun:test";
import { InMemorySourceOverlayRepository } from "cms-sources/default-implementation/InMemorySourceOverlayRepository";
import { InMemorySourceRepository } from "cms-sources/default-implementation/InMemorySourceRepository";
import { SourceOverlaySourceRepository } from "cms-sources/core/overlays/sourceOverlay";
import type { Source } from "cms-sources/interfaces/Source";

export const SOURCE_PREFIX = "/base/.cms/sources/";

const source: Source = {
    urn: "urn:shop",
    endpoints: [
        {
            urn: "urn:shop:getCart",
            method: "GET",
            targetUrl: "https://api.shop.com/cart",
            output: [{ status: "200", body: { type: "object" } }],
        },
    ],
};

export async function seededSourceRepository() {
    const repository = new InMemorySourceRepository();
    await repository.createSource(source);
    return repository;
}

export async function dynamicOverlayHarness() {
    const inner = new InMemorySourceRepository();
    const overlays = new InMemorySourceOverlayRepository();
    await inner.createSource({
        urn: "urn:shop",
        endpoints: [
            {
                urn: "urn:shop:getCart",
                method: "GET",
                targetUrl: "https://api.shop.com/cart",
                output: [{ status: "200", body: { type: "object", properties: { id: { type: "string" } } } }],
            },
            {
                urn: "urn:shop:listFields",
                method: "GET",
                targetUrl: "https://api.shop.com/fields",
                access: { mode: "admin" },
                headers: [
                    {
                        name: "Authorization",
                        source: { from: "secret", ref: "${FIELDS_KEY}", prefix: "Bearer " },
                    },
                ],
                output: [{ status: "200", body: { type: "object" } }],
            },
        ],
    });
    await overlays.upsertOverlay({
        id: "shop-cart-fields",
        sourceId: "shop",
        output: [{ endpointId: "getCart" }],
        fieldSource: { endpointId: "listFields" },
        fields: [],
    });
    const fetchImpl = mock(async (input: Parameters<typeof fetch>[0]) => {
        const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
        if (path === "/fields") {
            return Response.json({ fields: [{ id: "company", label: "Company", type: "string" }] });
        }
        if (path === "/cart") {
            return Response.json({ id: "cart-1" });
        }
        return new Response("not found", { status: 404 });
    });
    const resolveSecret = mock(async () => "field-source-secret");
    const repository = new SourceOverlaySourceRepository(inner, overlays, { deps: { fetchImpl, resolveSecret } });
    return { repository, fetchImpl, resolveSecret };
}

export const okFetch = () =>
    mock(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
        Response.json({ ok: true }),
    );
