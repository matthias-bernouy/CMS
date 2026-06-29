import { describe, expect, test } from "bun:test";
import { importIntegration } from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import {
    buildUpstreamUrl,
    InMemorySourceRepository,
    resolveEndpoint,
    seedSources,
    validateSource,
} from "@bernouy/cms-sources";
import { banEndpoint, BAN_SOURCE, searchParams } from "./helpers";

describe("@bernouy/cms-integrations BAN integration", () => {
    test("imports the first-party BAN address source declaratively", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();

        const result = await importIntegration({ sources, secrets }, { kind: "ban", answers: {}, options: {} });

        expect(result).toEqual({ artifacts: [{ type: "source", id: "urn:ban", action: "created" }] });
        const installed = await sources.getSource("urn:ban");
        expect(validateSource(installed!)).toEqual([]);
        expect(installed?.meta).toEqual(BAN_SOURCE.meta);
        expect(installed?.endpoints.map(endpoint => [endpoint.urn, endpoint.targetUrl])).toEqual(
            BAN_SOURCE.endpoints.map(endpoint => [endpoint.urn, endpoint.targetUrl]),
        );
        expect(installed?.endpoints[0]?.output).toEqual(BAN_SOURCE.endpoints[0]?.output);
        expect(await secrets.listKeys()).toEqual([]);
    });

    test("provides a valid source contract for proxy execution", async () => {
        expect(validateSource(BAN_SOURCE)).toEqual([]);

        const repo = new InMemorySourceRepository();
        await seedSources(repo, [BAN_SOURCE]);

        const search = await resolveEndpoint(repo, ["ban", "search"], "GET");
        expect(search.ok).toBe(true);
        if (search.ok) expect(search.endpoint.urn).toBe("urn:ban:search");

        const reverse = await resolveEndpoint(repo, ["ban", "reverse"], "GET");
        expect(reverse.ok).toBe(true);
    });

    test("search builds the upstream URL with only declared query params", () => {
        const result = buildUpstreamUrl(
            banEndpoint("urn:ban:search"),
            searchParams(`q=${encodeURIComponent("8 bd du port")}&limit=5&evil=1`),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const url = new URL(result.url);
        expect(url.origin + url.pathname).toBe("https://api-adresse.data.gouv.fr/search/");
        expect(url.searchParams.get("q")).toBe("8 bd du port");
        expect(url.searchParams.get("limit")).toBe("5");
        expect(url.searchParams.get("evil")).toBeNull();
    });

    test("search requires an address query", () => {
        const result = buildUpstreamUrl(banEndpoint("urn:ban:search"), searchParams(""));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe(400);
    });

    test("declares a 200 response shape for field binding", () => {
        const response = banEndpoint("urn:ban:search").output;
        const body = response?.[0]?.body;
        expect(response?.[0]?.status).toBe("200");
        expect(body?.properties?.features?.type).toBe("array");
        expect(body?.properties?.features?.items?.properties?.properties?.properties?.label?.type).toBe("string");
    });

    test("reverse builds the upstream URL from coordinates", () => {
        const result = buildUpstreamUrl(banEndpoint("urn:ban:reverse"), searchParams("lat=48.85&lon=2.35"));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const url = new URL(result.url);
        expect(url.origin + url.pathname).toBe("https://api-adresse.data.gouv.fr/reverse/");
        expect(url.searchParams.get("lat")).toBe("48.85");
        expect(url.searchParams.get("lon")).toBe("2.35");
    });
});
