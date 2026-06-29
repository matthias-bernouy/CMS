import { describe, test, expect } from "bun:test";
import getSource from "cms-control/api/sources/sources.get";
import { CompositeSourceRepository, InMemorySourceRepository, SYSTEM_AUTH_SOURCE_URN, SYSTEM_SOURCES } from "@bernouy/cms-sources";

const makeCms = () => {
    const sources = new InMemorySourceRepository();
    return { cms: { sources } as any, sources };
};

const seed = (sources: InMemorySourceRepository) => sources.createSource({
    urn: "urn:shop",
    meta: { name: "Shop" },
    endpoints: [
        { urn: "urn:shop:getCart", method: "GET", targetUrl: "https://api.shop.com/cart" },
        { urn: "urn:shop:addItem", method: "POST", targetUrl: "https://api.shop.com/items" },
    ],
});

const get = (qs: string) =>
    new Request("http://localhost/cms/api/sources" + qs, { method: "GET" });

describe("GET /api/sources?urn=", () => {
    test("returns the full source + derived id + per-endpoint endpointId + endpointsJson", async () => {
        const { cms, sources } = makeCms();
        await seed(sources);

        const res = await getSource(get("?urn=urn:shop"), cms);
        const body = await res.json();

        expect(body.urn).toBe("urn:shop");
        expect(body.id).toBe("shop");                                  // derived (urn: prefix stripped)
        expect(body.readonly).toBe(false);
        expect(body.readonlyNoticeStyle).toBe("display:none;");
        expect(body.endpoints).toHaveLength(2);
        expect(body.endpoints[0].endpointId).toBe("getCart");          // derived per-endpoint
        expect(body.endpoints[1].endpointId).toBe("addItem");
        expect(JSON.parse(body.endpointsJson)).toEqual(body.endpoints); // the C2 prefill string
    });

    test("flattens input.params into endpoints[].params for the editor", async () => {
        const { cms, sources } = makeCms();
        await sources.createSource({
            urn: "urn:shop",
            meta: { name: "Shop" },
            endpoints: [{
                urn: "urn:shop:list",
                method: "GET",
                targetUrl: "https://api.shop.com/x",
                input: { params: [{ name: "limit", in: "query", schema: { type: "number" }, required: true }] },
            }],
        });

        const body = await (await getSource(get("?urn=urn:shop"), cms)).json();
        expect(body.endpoints[0].params).toEqual([
            { name: "limit", in: "query", type: "number", required: true },
        ]);
        // endpointsJson round-trips the same enriched shape (incl. params)
        expect(JSON.parse(body.endpointsJson)[0].params).toEqual(body.endpoints[0].params);
    });

    test("system sources are readable but marked readonly", async () => {
        const sources = new CompositeSourceRepository(new InMemorySourceRepository(), SYSTEM_SOURCES);
        const cms = { sources } as any;

        const body = await (await getSource(get(`?urn=${SYSTEM_AUTH_SOURCE_URN}`), cms)).json();
        expect(body.id).toBe("system-auth");
        expect(body.readonly).toBe(true);
        expect(body.editableStyle).toBe("display:none;");
        expect(body.readonlyNoticeStyle).toBe("");
        expect(body.endpoints.map((endpoint: { endpointId: string }) => endpoint.endpointId)).toContain("login");
    });

    test("unknown urn → InvalidParam", async () => {
        const { cms } = makeCms();
        await expect(getSource(get("?urn=urn:nope"), cms)).rejects.toThrow(/Invalid param urn/);
    });

    test("missing urn → MissingParam", async () => {
        const { cms } = makeCms();
        await expect(getSource(get(""), cms)).rejects.toThrow(/Missing param urn/);
    });
});
