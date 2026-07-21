import { InMemoryFunctionRepository, type CmsFunction } from "@bernouy/cms-functions";
import { InMemorySourceRepository, type SourceEndpoint } from "@bernouy/cms-sources";
import { InMemoryTriggerRepository, type TriggerRecord } from "@bernouy/cms-triggers";

export const endpoint: SourceEndpoint = {
    urn: "urn:orders:createOrder",
    method: "POST",
    targetUrl: "https://api.example.com/orders",
};

export async function fixture() {
    const triggers = new InMemoryTriggerRepository();
    const functions = new InMemoryFunctionRepository();
    const sources = new InMemorySourceRepository();
    const calls: Array<{ url: string; body?: unknown }> = [];
    await sources.createSource({
        urn: "urn:notifications",
        endpoints: [
            {
                urn: "urn:notifications:send",
                method: "POST",
                targetUrl: "https://api.example.com/notify",
                input: {
                    params: [
                        { name: "order", in: "query", schema: { type: "string" } },
                        { name: "source", in: "query", schema: { type: "string" } },
                        { name: "actor", in: "query", schema: { type: "string" } },
                    ],
                    body: {
                        type: "object",
                        properties: {
                            method: { type: "string" },
                            email: { type: "string" },
                        },
                    },
                },
                output: [{ status: "200", body: { type: "object", properties: { ok: { type: "boolean" } } } }],
            },
        ],
    });
    await functions.createFunction(notifyOrderFunction);
    return { triggers, functions, sources, calls };
}

export const notifyOrderFunction: CmsFunction = {
    id: "notifyOrder",
    method: "POST",
    input: {
        params: {
            order: { type: "string" },
            source: { type: "string" },
            actor: { type: "string" },
        },
        body: {
            type: "object",
            properties: {
                method: { type: "string" },
                email: { type: "string" },
            },
        },
    },
    steps: [
        {
            id: "send",
            call: {
                source: "notifications",
                endpoint: "send",
                params: {
                    order: "$input.params.order",
                    source: "$input.params.source",
                    actor: "$input.params.actor",
                },
                body: "$input.body",
            },
        },
    ],
    return: { status: 204 },
};

export function trigger(partial: Partial<TriggerRecord>): TriggerRecord {
    return {
        id: "trigger",
        enabled: true,
        event: { kind: "endpoint", phase: "response" },
        function: { id: "notifyOrder" },
        ...partial,
    };
}

export function jsonRequest(body: unknown): Request {
    return new Request("https://cms.test/.cms/sources/orders/createOrder?draft=1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

export async function tick(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
}
