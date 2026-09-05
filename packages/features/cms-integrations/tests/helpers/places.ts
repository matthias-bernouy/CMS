import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import { sourceDtoToSource, type SourceDto } from "@bernouy/cms-sources";
import { PLACE_SEARCH_RESPONSE } from "./placeShape";

const PLACES_SOURCE_DTO: SourceDto = {
    id: "places",
    meta: {
        name: "Places Directory",
        description: "Example address lookup API",
        icon: "map-pin",
    },
    endpoints: [
        {
            endpointId: "search",
            method: "GET",
            targetUrl: "https://places.example.test/search/",
            meta: {
                name: "Address search",
                description: "Address to coordinates (GeoJSON)",
            },
            params: [
                { name: "q", in: "query", required: true, description: "Address to geocode", type: "string" },
                { name: "limit", in: "query", description: "Maximum number of results", type: "number" },
                { name: "autocomplete", in: "query", description: "1 enables autocomplete", type: "number" },
                {
                    name: "type",
                    in: "query",
                    description: "housenumber | street | locality | municipality",
                    type: "string",
                },
                { name: "postcode", in: "query", type: "string" },
                { name: "citycode", in: "query", type: "string" },
            ],
            output: [{ status: "200", body: PLACE_SEARCH_RESPONSE }],
        },
        {
            endpointId: "reverse",
            method: "GET",
            targetUrl: "https://places.example.test/reverse/",
            meta: {
                name: "Reverse geocoding",
                description: "Coordinates to address",
            },
            params: [
                { name: "lat", in: "query", required: true, description: "Latitude", type: "number" },
                { name: "lon", in: "query", required: true, description: "Longitude", type: "number" },
                { name: "type", in: "query", type: "string" },
            ],
            output: [{ status: "200", body: PLACE_SEARCH_RESPONSE }],
        },
    ],
};

export const PLACES_DEFINITION: IntegrationDefinition = {
    kind: "places",
    label: "Places Directory",
    version: "1.0.0",
    category: "Data",
    inputs: [],
    artifacts: [
        { type: "source", source: PLACES_SOURCE_DTO },
        {
            type: "dashboard-view",
            view: {
                schemaVersion: 2,
                id: "places-directory",
                meta: { name: "Address search", icon: "map-pin" },
                source: "places",
                view: {
                    id: "addresses",
                    label: "Address search",
                    widgets: [
                        {
                            widget: "w-table",
                            id: "addressesTable",
                            source: {
                                endpoint: "search",
                                params: { q: "$filter.q" },
                                itemsPath: "features",
                            },
                            rowKey: "properties.label",
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
                        },
                    ],
                },
                availability: {
                    catalog: true,
                    defaultPlacement: { dashboardId: "places-directory" },
                },
            },
        },
    ],
};

export const PLACES_SOURCE = sourceDtoToSource(PLACES_SOURCE_DTO);

export const searchParams = (value: string) => new URL(`http://local/?${value}`).searchParams;

export const placesEndpoint = (urn: string) => PLACES_SOURCE.endpoints.find((endpoint) => endpoint.urn === urn)!;
