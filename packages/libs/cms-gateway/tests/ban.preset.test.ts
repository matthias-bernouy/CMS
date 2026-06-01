import { describe, test, expect } from "bun:test";
import { BAN_PROVIDER } from "cms-gateway/presets/ban";
import { validateProvider } from "cms-gateway/core/validateProvider";
import { seedProviders } from "cms-gateway/core/seedProviders";
import { resolveEndpoint } from "cms-gateway/core/resolveEndpoint";
import { buildUpstreamUrl } from "cms-gateway/core/buildUpstreamUrl";
import { InMemoryGatewayRepository } from "cms-gateway/default-implementation/GatewayRepository/memory";

const q = (s: string) => new URL("http://local/?" + s).searchParams;
const endpoint = (urn: string) => BAN_PROVIDER.endpoints.find(e => e.urn === urn)!;

describe("BAN preset", () => {
    test("is a valid provider", () => {
        expect(validateProvider(BAN_PROVIDER)).toEqual([]);
    });

    test("seeds + resolves its endpoints", async () => {
        const repo = new InMemoryGatewayRepository();
        await seedProviders(repo, [BAN_PROVIDER]);

        const search = await resolveEndpoint(repo, ["ban", "search"], "GET");
        expect(search.ok).toBe(true);
        if (search.ok) expect(search.endpoint.urn).toBe("urn:ban:search");

        expect((await resolveEndpoint(repo, ["ban", "reverse"], "GET")).ok).toBe(true);
    });

    test("search builds the upstream URL with only declared query params", () => {
        const r = buildUpstreamUrl(endpoint("urn:ban:search"), q("q=" + encodeURIComponent("8 bd du port") + "&limit=5&evil=1"));
        expect(r.ok).toBe(true);
        if (r.ok) {
            const u = new URL(r.url);
            expect(u.origin + u.pathname).toBe("https://api-adresse.data.gouv.fr/search/");
            expect(u.searchParams.get("q")).toBe("8 bd du port");
            expect(u.searchParams.get("limit")).toBe("5");
            expect(u.searchParams.get("evil")).toBeNull();   // undeclared dropped
        }
    });

    test("search requires q", () => {
        const r = buildUpstreamUrl(endpoint("urn:ban:search"), q(""));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.status).toBe(400);
    });

    test("declares a 200 response shape (output) for field binding", () => {
        const resp = endpoint("urn:ban:search").output;
        expect(resp?.[0]?.status).toBe("200");
        const out = resp?.[0]?.body;
        expect(out?.properties?.features?.type).toBe("array");
        expect(out?.properties?.features?.items?.properties?.properties?.properties?.label?.type).toBe("string");
    });

    test("reverse builds the upstream URL from lat/lon", () => {
        const r = buildUpstreamUrl(endpoint("urn:ban:reverse"), q("lat=48.85&lon=2.35"));
        expect(r.ok).toBe(true);
        if (r.ok) {
            const u = new URL(r.url);
            expect(u.origin + u.pathname).toBe("https://api-adresse.data.gouv.fr/reverse/");
            expect(u.searchParams.get("lat")).toBe("48.85");
            expect(u.searchParams.get("lon")).toBe("2.35");
        }
    });
});
