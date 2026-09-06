import { manageSource } from "../../../connectors/supabase/functions/cms-stripe-connect-management/lifecycle/handler.ts";
import { HttpError } from "../../../connectors/supabase/functions/cms-stripe-connect-management/core/runtime.ts";
type RecordValue = Record<string, any>;
export function harness() {
    const originalFetch = globalThis.fetch;
    const originalDeno = (globalThis as any).Deno;
    const env: Record<string, string> = {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "supabase-test",
        CMS_STRIPE_CONNECT_API_KEY: "cms-test",
    };
    const row: RecordValue = {
        id: "default",
        values: {},
        saved_revision: null,
        applied_revision: null,
        operation: "idle",
        resources: [],
    };
    const endpoints: RecordValue[] = [];
    const provider = { accountId: "acct_test" };
    const requests: { url: string; method: string; body?: string }[] = [];
    (globalThis as any).Deno = { env: { get: (name: string) => env[name] } };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const method = init?.method ?? "GET";
        requests.push({ url: url.href, method, body: init?.body?.toString() });
        if (url.hostname === "project.supabase.co") {
            if (method === "PATCH") {
                const expected = row.saved_revision === null ? "is.null" : `eq.${row.saved_revision}`;
                if (
                    url.searchParams.get("saved_revision") !== expected ||
                    url.searchParams.get("operation") !== `eq.${row.operation}`
                ) {
                    return Response.json([]);
                }
                Object.assign(row, JSON.parse(String(init?.body)));
            }
            return Response.json([row]);
        }
        if (url.hostname !== "api.stripe.com") {
            throw new Error("Unexpected external request");
        }
        if (url.pathname === "/v1/account") {
            return Response.json({ id: provider.accountId });
        }
        const v1 = url.pathname.startsWith("/v1/");
        const collection = v1 ? "/v1/webhook_endpoints" : "/v2/core/event_destinations";
        if (method === "GET") {
            return Response.json({
                data: endpoints.filter(
                    (value) => value.protocol === (v1 ? "v1" : "v2") && value.accountId === provider.accountId,
                ),
            });
        }
        if (method === "DELETE") {
            const index = endpoints.findIndex((value) => url.pathname.endsWith(value.id));
            endpoints.splice(index, 1);
            return Response.json({ deleted: true });
        }
        const data = v1 ? Object.fromEntries(new URLSearchParams(String(init?.body))) : JSON.parse(String(init?.body));
        if (v1) {
            const params = new URLSearchParams(String(init?.body));
            data.enabled_events = params.getAll("enabled_events[]");
            data.metadata = Object.fromEntries(
                [...params]
                    .filter(([key]) => key.startsWith("metadata["))
                    .map(([key, value]) => [key.slice(9, -1), value]),
            );
        }
        let endpoint = endpoints.find((value) => url.pathname.endsWith(value.id));
        if (url.pathname === collection) {
            endpoint = {
                id: `${v1 ? "we" : "ed"}_${endpoints.length}`,
                protocol: v1 ? "v1" : "v2",
                accountId: provider.accountId,
            };
            endpoints.push(endpoint);
        }
        if (!endpoint) {
            throw new Error("Missing owned endpoint");
        }
        Object.assign(endpoint, data, { status: "enabled" });
        return Response.json({
            ...endpoint,
            ...(v1
                ? { secret: `whsec_${endpoint.id}` }
                : { webhook_endpoint: { ...endpoint.webhook_endpoint, signing_secret: `whsec_${endpoint.id}` } }),
        });
    }) as typeof fetch;
    const secrets = { stripeSecretKey: "sk_test_private", stripePublishableKey: "pk_test_public" };
    const generated: Record<string, string> = {};
    return {
        row,
        env,
        endpoints,
        provider,
        requests,
        secrets,
        generated,
        async call(operation: string, input: RecordValue = {}) {
            try {
                return await manageSource(
                    new Request("https://project.supabase.co/source-management", {
                        method: "POST",
                        headers: { authorization: "Bearer cms-test", "content-type": "application/json" },
                        body: JSON.stringify({
                            operation,
                            installationId: "installation-test",
                            definitionVersion: "1.0.0",
                            input,
                            secretValues: secrets,
                            generatedSecretValues: generated,
                        }),
                    }),
                );
            } catch (error) {
                if (error instanceof HttpError) {
                    return Response.json({ error: error.message }, { status: error.status });
                }
                throw error;
            }
        },
        restore() {
            globalThis.fetch = originalFetch;
            (globalThis as any).Deno = originalDeno;
        },
    };
}
