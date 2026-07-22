import {
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    SourceOverlaySourceRepository,
    type SourceEndpoint,
} from "@bernouy/cms-sources";

export const targetEndpoint: SourceEndpoint = {
    urn: "urn:accounts:getAccount",
    method: "GET",
    targetUrl: "https://api.example.com/account",
    access: { mode: "auth" },
    output: [
        {
            status: "200",
            body: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    profile: {
                        type: "object",
                        properties: { displayName: { type: "string" } },
                        required: ["displayName"],
                    },
                },
                required: ["id"],
            },
        },
    ],
};

export const enrichedTargetEndpoint: SourceEndpoint = {
    ...targetEndpoint,
    output: [
        {
            status: "200",
            body: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    profile: {
                        type: "object",
                        properties: {
                            displayName: { type: "string" },
                            nickname: { type: "string", title: "Nickname" },
                        },
                        required: ["displayName", "nickname"],
                    },
                    metadata: {
                        type: "object",
                        properties: {
                            tags: { type: "array", items: { type: "string" }, title: "Tags" },
                        },
                    },
                },
                required: ["id"],
            },
        },
    ],
};

export const dynamicFieldsResponse = {
    fields: [
        {
            id: "nickname",
            label: "Nickname",
            type: "string",
            path: "profile.nickname",
            required: true,
            providerSecret: "payload-private-value",
        },
        { id: "tags", label: "Tags", type: "string", multiple: true },
        { id: "internalCode", label: "Internal code", type: "string", exposeToEditorSources: false },
        { id: "nickname", label: "Duplicate nickname", type: "number" },
        { id: "invalid.field", label: "Invalid field", type: "string" },
    ],
    connectorSecrets: { token: "payload-connector-secret" },
};

export async function dynamicOverlayRepository(fetchImpl: typeof fetch) {
    const inner = new InMemorySourceRepository();
    const overlays = new InMemorySourceOverlayRepository();
    await inner.createSource({
        urn: "urn:accounts",
        endpoints: [
            targetEndpoint,
            {
                urn: "urn:accounts:listFields",
                method: "GET",
                targetUrl: "https://api.example.com/fields",
                headers: [
                    {
                        name: "Authorization",
                        source: { from: "secret", ref: "${ACCOUNT_FIELDS_KEY}", prefix: "Bearer " },
                    },
                ],
                output: [{ status: "200", body: { type: "object" } }],
            },
        ],
    });
    await overlays.upsertOverlay({
        id: "account-fields",
        sourceId: "accounts",
        output: [{ endpointId: "getAccount" }],
        fieldSource: { endpointId: "listFields" },
        fields: [],
    });
    return new SourceOverlaySourceRepository(inner, overlays, {
        deps: { fetchImpl, resolveSecret: async () => "resolved-field-source-secret" },
    });
}
