import { describe, test, expect } from "bun:test";
import listSources from "cms-control/api/sources/list.get";
import {
    CompositeSourceRepository,
    InMemorySourceRepository,
    SYSTEM_AUTH_SOURCE_URN,
    SYSTEM_SOURCES,
} from "@bernouy/cms-sources";

const makeCms = () => {
    const sources = new InMemorySourceRepository();
    return { cms: { sources } as any, sources };
};

const list = () => new Request("http://localhost/cms/api/sources/list", { method: "GET" });

describe("GET /api/sources/list", () => {
    test("empty store → []", async () => {
        const { cms } = makeCms();
        const rows = await (await listSources(list(), cms)).json();
        expect(rows).toEqual([]);
    });

    test("returns {urn,id,name,endpointCount}; name defaults to id when meta.name absent", async () => {
        const { cms, sources } = makeCms();
        await sources.createSource({
            urn: "urn:shop",
            endpoints: [
                { urn: "urn:shop:getCart", method: "GET", targetUrl: "https://api.shop.com/cart" },
                { urn: "urn:shop:addItem", method: "POST", targetUrl: "https://api.shop.com/items" },
            ],
        });

        const rows = await (await listSources(list(), cms)).json();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({ urn: "urn:shop", id: "shop", name: "shop", endpointCount: 2, readonly: false });
    });

    test("marks system sources as readonly", async () => {
        const sources = new CompositeSourceRepository(new InMemorySourceRepository(), SYSTEM_SOURCES);
        const cms = { sources } as any;

        const rows = await (await listSources(list(), cms)).json();
        expect(rows[0]).toEqual({
            urn:           SYSTEM_AUTH_SOURCE_URN,
            id:            "system-auth",
            name:          "Authentication",
            endpointCount: 8,
            readonly:      true,
        });
    });
});
