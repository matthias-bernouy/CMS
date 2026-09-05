import { describe, expect, test } from "bun:test";
import { importIntegration } from "@bernouy/cms-integrations";
import { InMemoryDashboardRepository, InMemoryDashboardViewRepository } from "@bernouy/cms-dashboards";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import {
    buildUpstreamUrl,
    InMemorySourceRepository,
    resolveEndpoint,
    seedSources,
    validateSource,
} from "@bernouy/cms-sources";
import { placesEndpoint, PLACES_DEFINITION, PLACES_SOURCE, searchParams } from "../helpers";

describe("@bernouy/cms-integrations example places integration", () => {
    test("imports an address source declaratively", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const dashboards = new InMemoryDashboardRepository();
        const dashboardViews = new InMemoryDashboardViewRepository();

        const result = await importIntegration(
            { sources, secrets, dashboards, dashboardViews },
            { kind: "places", answers: {}, options: {} },
            [PLACES_DEFINITION],
        );

        expect(result).toEqual({
            artifacts: [
                { type: "source", id: "urn:places", action: "created" },
                { type: "dashboard-view", id: "places-directory", action: "created" },
                { type: "dashboard", id: "places-directory", action: "created" },
            ],
        });
        const installed = await sources.getSource("urn:places");
        const dashboard = await dashboardViews.getView("places-directory");
        expect(validateSource(installed!)).toEqual([]);
        expect(installed?.meta).toEqual(PLACES_SOURCE.meta);
        expect(installed?.endpoints.map((endpoint) => [endpoint.urn, endpoint.targetUrl])).toEqual(
            PLACES_SOURCE.endpoints.map((endpoint) => [endpoint.urn, endpoint.targetUrl]),
        );
        expect(installed?.endpoints[0]?.output).toEqual(PLACES_SOURCE.endpoints[0]?.output);
        expect(dashboard?.source).toBe("places");
        expect(dashboard?.view.widgets[0]).toMatchObject({
            widget: "w-table",
            id: "addressesTable",
            source: {
                endpoint: "search",
                params: { q: "$filter.q" },
                itemsPath: "features",
            },
            rowKey: "properties.label",
        });
        expect(dashboard?.view.widgets[0]).toMatchObject({
            widget: "w-table",
            filters: [
                {
                    id: "q",
                    param: "q",
                    type: "text",
                    label: "Search",
                    placeholder: "Search addresses",
                },
            ],
            columns: [
                { id: "address", path: "properties.label", label: "Address", primary: true },
                { id: "city", path: "properties.city", label: "City" },
                { id: "postcode", path: "properties.postcode", label: "Postcode" },
                { id: "score", path: "properties.score", label: "Score" },
            ],
        });
        expect(await secrets.listKeys()).toEqual([]);
    });

    test("provides a valid source contract for proxy execution", async () => {
        expect(validateSource(PLACES_SOURCE)).toEqual([]);

        const repo = new InMemorySourceRepository();
        await seedSources(repo, [PLACES_SOURCE]);

        const search = await resolveEndpoint(repo, ["places", "search"], "GET");
        expect(search.ok).toBe(true);
        if (search.ok) {
            expect(search.endpoint.urn).toBe("urn:places:search");
        }

        const reverse = await resolveEndpoint(repo, ["places", "reverse"], "GET");
        expect(reverse.ok).toBe(true);
    });

    test("search builds the upstream URL with only declared query params", () => {
        const result = buildUpstreamUrl(
            placesEndpoint("urn:places:search"),
            searchParams(`q=${encodeURIComponent("8 bd du port")}&limit=5&evil=1`),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        const url = new URL(result.url);
        expect(url.origin + url.pathname).toBe("https://places.example.test/search/");
        expect(url.searchParams.get("q")).toBe("8 bd du port");
        expect(url.searchParams.get("limit")).toBe("5");
        expect(url.searchParams.get("evil")).toBeNull();
    });

    test("search requires an address query", () => {
        const result = buildUpstreamUrl(placesEndpoint("urn:places:search"), searchParams(""));
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(400);
        }
    });

    test("declares a 200 response shape for field binding", () => {
        const response = placesEndpoint("urn:places:search").output;
        const body = response?.[0]?.body;
        expect(response?.[0]?.status).toBe("200");
        expect(body?.properties?.features?.type).toBe("array");
        expect(body?.properties?.features?.items?.properties?.properties?.properties?.label?.type).toBe("string");
    });

    test("reverse builds the upstream URL from coordinates", () => {
        const result = buildUpstreamUrl(placesEndpoint("urn:places:reverse"), searchParams("lat=48.85&lon=2.35"));

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        const url = new URL(result.url);
        expect(url.origin + url.pathname).toBe("https://places.example.test/reverse/");
        expect(url.searchParams.get("lat")).toBe("48.85");
        expect(url.searchParams.get("lon")).toBe("2.35");
    });
});
