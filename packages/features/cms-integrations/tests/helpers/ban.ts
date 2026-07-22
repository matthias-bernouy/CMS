import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import { sourceDtoToSource, type SourceDto } from "@bernouy/cms-sources";
import { FEATURE_COLLECTION } from "./banShape";

const BAN_SOURCE_DTO: SourceDto = {
    id: "ban",
    meta: {
        name: "Base Adresse Nationale",
        description: "French national address geocoding API",
        icon: "map-pin",
    },
    endpoints: [
        {
            endpointId: "search",
            method: "GET",
            targetUrl: "https://api-adresse.data.gouv.fr/search/",
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
            output: [{ status: "200", body: FEATURE_COLLECTION }],
        },
        {
            endpointId: "reverse",
            method: "GET",
            targetUrl: "https://api-adresse.data.gouv.fr/reverse/",
            meta: {
                name: "Reverse geocoding",
                description: "Coordinates to address",
            },
            params: [
                { name: "lat", in: "query", required: true, description: "Latitude", type: "number" },
                { name: "lon", in: "query", required: true, description: "Longitude", type: "number" },
                { name: "type", in: "query", type: "string" },
            ],
            output: [{ status: "200", body: FEATURE_COLLECTION }],
        },
    ],
};

export const BAN_DEFINITION: IntegrationDefinition = {
    kind: "ban",
    label: "Base Adresse Nationale",
    version: "1.0.0",
    category: "Data",
    inputs: [],
    artifacts: [
        { type: "source", source: BAN_SOURCE_DTO },
        {
            type: "dashboard",
            dashboard: {
                id: "ban-addresses",
                meta: { name: "Address search", icon: "map-pin" },
                source: "ban",
                views: [
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
        },
    ],
};

export const BAN_SOURCE = sourceDtoToSource(BAN_SOURCE_DTO);

export const searchParams = (value: string) => new URL(`http://local/?${value}`).searchParams;

export const banEndpoint = (urn: string) => BAN_SOURCE.endpoints.find((endpoint) => endpoint.urn === urn)!;
