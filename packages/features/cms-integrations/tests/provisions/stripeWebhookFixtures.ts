import type { IntegrationProvisionDeployment } from "@bernouy/cms-integrations";

export function stripeWebhookDeployment(
    eventsFrom: Array<"self" | "other_accounts"> = ["self"],
): IntegrationProvisionDeployment {
    return {
        integrationKind: "stripe-connect",
        version: "1.0.0",
        provider: "stripe-webhooks",
        configuration: {
            secretKey: "sk_test_private",
            owner: "main",
            v1ApiVersion: "2026-02-25.clover",
            v2ApiVersion: "2026-06-24.dahlia",
            destinations: [
                v1Destination("platform", false),
                v1Destination("connect", true),
                {
                    protocol: "v2",
                    name: "accountsV2",
                    url: "https://project.supabase.co/functions/v1/webhook-v2",
                    eventsFrom,
                    enabledEvents: ["v2.core.account[requirements].updated"],
                },
            ],
        },
        outputs: [
            { name: "platform", key: "PLATFORM_SECRET" },
            { name: "connect", key: "CONNECT_SECRET" },
            { name: "accountsV2", key: "ACCOUNTS_V2_SECRET" },
        ],
    };
}

export function stripeEndpoint(id: string, name: string) {
    return {
        id,
        api_version: "2026-02-25.clover",
        metadata: {
            cmscore_integration: "stripe-connect",
            cmscore_instance: "main",
            cmscore_destination: name,
        },
    };
}

export async function capturedRequest(input: RequestInfo | URL, init?: RequestInit) {
    return {
        url: String(input),
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body: typeof init?.body === "string" ? init.body : (init?.body?.toString() ?? ""),
    };
}

export function json(value: unknown, status = 200): Response {
    return Response.json(value, { status });
}

function v1Destination(name: string, connect: boolean) {
    return {
        protocol: "v1",
        name,
        url: `https://project.supabase.co/functions/v1/${name}`,
        connect,
        enabledEvents: ["payment_intent.succeeded"],
    };
}
