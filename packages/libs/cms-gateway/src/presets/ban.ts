import type { Provider } from "../interfaces/Gateway";
import type { DataShape } from "../interfaces/DataShape";

/**
 * GeoJSON FeatureCollection returned by both BAN endpoints. Declared as the
 * endpoints' `output` so the editor can bind the returned fields
 * (`features[].properties.label`, `geometry.coordinates`, …).
 */
const FEATURE_COLLECTION: DataShape = {
    type: "object",
    properties: {
        type: { type: "string" },
        features: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    type: { type: "string" },
                    geometry: {
                        type: "object",
                        properties: {
                            type: { type: "string" },
                            coordinates: { type: "array", items: { type: "number" } },
                        },
                    },
                    properties: {
                        type: "object",
                        properties: {
                            label:    { type: "string" },
                            score:    { type: "number" },
                            type:     { type: "string" },
                            name:     { type: "string" },
                            postcode: { type: "string" },
                            citycode: { type: "string" },
                            city:     { type: "string" },
                            context:  { type: "string" },
                            x:        { type: "number" },
                            y:        { type: "number" },
                        },
                    },
                },
            },
        },
    },
};

/**
 * Base Adresse Nationale — French national address geocoding API
 * (https://api-adresse.data.gouv.fr). Public, no auth → a good Step-0 default.
 *
 * Opt-in example provider: the agnostic gateway core never references it; a
 * consumer seeds it explicitly. Exposed via the "@bernouy/cms-gateway/presets"
 * subpath, not the main entry, so the core API stays provider-agnostic.
 */
export const BAN_PROVIDER: Provider = {
    urn: "urn:ban",
    meta: { name: "Base Adresse Nationale", description: "Géocodage d'adresses françaises", icon: "map-pin" },
    endpoints: [
        {
            urn: "urn:ban:search",
            method: "GET",
            targetUrl: "https://api-adresse.data.gouv.fr/search/",
            rules: [],
            meta: { name: "Recherche d'adresse", description: "Adresse → coordonnées (GeoJSON)" },
            input: {
                params: [
                    { name: "q",            in: "query", required: true, description: "Adresse à géocoder",          schema: { type: "string" } },
                    { name: "limit",        in: "query", description: "Nombre de résultats",                         schema: { type: "number" } },
                    { name: "autocomplete", in: "query", description: "1 pour activer l'autocomplétion",             schema: { type: "number" } },
                    { name: "type",         in: "query", description: "housenumber | street | locality | municipality", schema: { type: "string" } },
                    { name: "postcode",     in: "query", schema: { type: "string" } },
                    { name: "citycode",     in: "query", schema: { type: "string" } },
                ],
            },
            output: FEATURE_COLLECTION,
        },
        {
            urn: "urn:ban:reverse",
            method: "GET",
            targetUrl: "https://api-adresse.data.gouv.fr/reverse/",
            rules: [],
            meta: { name: "Géocodage inverse", description: "Coordonnées → adresse" },
            input: {
                params: [
                    { name: "lat",  in: "query", required: true, description: "Latitude",  schema: { type: "number" } },
                    { name: "lon",  in: "query", required: true, description: "Longitude", schema: { type: "number" } },
                    { name: "type", in: "query", schema: { type: "string" } },
                ],
            },
            output: FEATURE_COLLECTION,
        },
    ],
};
