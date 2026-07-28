import type { DataField } from "@bernouy/cms-content/editor";
import type { EditorDataSource } from "@bernouy/cms-editor-system-v2";
import type { Source } from "@bernouy/cms-sources";

export type EditorSourceTestDto = {
    label: string;
    url: string;
    method: string;
    provider?: string;
    providerUrn?: string;
    endpointUrn?: string;
    providerLabel?: string;
    params?: Array<{ name: string; in: string; required?: boolean }>;
    body?: {
        contentType: "application/json";
        fields: Array<{ path: string; type: string; required?: boolean }>;
    };
    fields: DataField[];
};

export const DIRECT_CATALOG_SOURCE: EditorDataSource = {
    label: "Integration repository catalog",
    url: "/.cms/repository/api/integrations/catalog",
    method: "GET",
    provider: "repository",
    params: [{ name: "q", in: "query", type: "string" }],
    fields: [{ path: "integrations", type: "array", children: [{ path: "kind", type: "string" }] }],
};

export const MIXED_PROVIDER: Source = {
    urn: "urn:mixed",
    endpoints: [
        {
            urn: "urn:mixed:list",
            method: "GET",
            targetUrl: "https://api.example.com/items",
            access: { mode: "public" },
            input: {
                params: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                    { name: "q", in: "query", schema: { type: "string" } },
                    { name: "X-Trace", in: "header", schema: { type: "string" } },
                ],
            },
            output: [
                {
                    status: "200",
                    body: { type: "object", properties: { items: { type: "array", items: { type: "string" } } } },
                },
            ],
        },
        {
            urn: "urn:mixed:create",
            method: "POST",
            targetUrl: "https://api.example.com/items",
            access: { mode: "auth" },
            output: [
                {
                    status: "200",
                    body: { type: "object", properties: { id: { type: "string" } } },
                },
            ],
        },
    ],
};

export const ADDRESS_PROVIDER: Source = {
    urn: "urn:address",
    meta: { name: "Address API", description: "Address lookup", icon: "map-pin" },
    endpoints: [
        {
            urn: "urn:address:search",
            method: "GET",
            targetUrl: "https://api.example.com/search",
            access: { mode: "public" },
            meta: { name: "Address search" },
            input: {
                params: [
                    { name: "q", in: "query", required: true, schema: { type: "string" } },
                    { name: "limit", in: "query", schema: { type: "number" } },
                ],
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            features: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        geometry: { type: "object" },
                                        properties: {
                                            type: "object",
                                            properties: { label: { type: "string" } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            ],
        },
        {
            urn: "urn:address:reverse",
            method: "GET",
            targetUrl: "https://api.example.com/reverse",
            access: { mode: "public" },
            meta: { name: "Reverse geocoding" },
            output: [{ status: "200", body: { type: "object" } }],
        },
    ],
};
