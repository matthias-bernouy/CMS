import {
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    type ExecutorDeps,
    type Source,
    type SourceOverlay,
} from "@bernouy/cms-sources";
import { createSourceOverlayFetchProbe } from "./sourceOverlayFetchProbe";

type Responder = (request: Request) => Response | Promise<Response>;

export const baseEndpoint = {
    urn: "urn:accounts:getAccount",
    method: "GET" as const,
    targetUrl: "https://api.example.com/account",
    output: [{ status: "200", body: { type: "object" as const } }],
};

export const dynamicOverlay: SourceOverlay = {
    id: "account-fields",
    sourceId: "accounts",
    output: [{ endpointId: "getAccount" }],
    fieldSource: { endpointId: "listFields" },
    fields: [],
};

export const invalidatingEndpoint = {
    urn: "urn:accounts:refreshSchema",
    method: "POST" as const,
    targetUrl: "https://api.example.com/refresh-schema",
    effects: { invalidatesSchema: true as const },
    output: [{ status: "503", body: { type: "object" as const } }],
};

export function enrichedEndpoint(label: string) {
    return {
        ...baseEndpoint,
        output: [{
            status: "200",
            body: {
                type: "object",
                properties: {
                    metadata: {
                        type: "object",
                        properties: { company: { type: "string", title: label } },
                    },
                },
            },
        }],
    };
}

export async function cacheHarness(
    respond: Responder = async () => fieldsResponse("Company"),
) {
    const probe = createSourceOverlayFetchProbe(respond);
    const inner = new InMemorySourceRepository();
    const overlays = new InMemorySourceOverlayRepository();
    const source: Source = {
        urn: "urn:accounts",
        endpoints: [baseEndpoint, {
            urn: "urn:accounts:listFields",
            method: "GET",
            targetUrl: "https://api.example.com/fields",
            output: [{ status: "200", body: { type: "object" } }],
        }],
    };
    await inner.createSource(source);
    await overlays.upsertOverlay(dynamicOverlay);
    const deps: ExecutorDeps = { fetchImpl: probe.fetchImpl };
    return { inner, overlays, probe, options: { deps } };
}

export function fieldsResponse(label: string): Response {
    return Response.json({ fields: [{ id: "company", label, type: "string" }] });
}
