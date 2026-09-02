import { afterAll, describe, expect, test } from "bun:test";
import {
    importIntegration,
    type IntegrationBlocArtifact,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { handleSourceRequest, InMemorySourceRepository, type SourceRepository } from "@bernouy/cms-sources";
import { InMemorySecretStore, secretRefToKey } from "@bernouy/cms-secrets";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";

type EdgeHandler = (request: Request) => Response | Promise<Response>;
type JsonRecord = Record<string, unknown>;

const sourcePrefix = "/.cms/sources/";
const functionsBaseUrl = "https://project.supabase.co/functions/v1";
const supabaseUrl = "https://project.supabase.co";
const edgeFunctionUrl = "../connectors/supabase/functions/cms-newsletter/index.ts";

const realFetch = globalThis.fetch;
const realDeno = (globalThis as { Deno?: unknown }).Deno;
let activeEnv: Record<string, string> = {};
let activeFetch: typeof fetch = realFetch;
let edgeHandler: EdgeHandler | undefined;

(
    globalThis as {
        Deno?: { env: { get: (key: string) => string | undefined }; serve: (handler: EdgeHandler) => unknown };
    }
).Deno = {
    env: { get: (key) => activeEnv[key] },
    serve(handler) {
        edgeHandler = handler;
        return {
            shutdown() {
                /* test stub */
            },
        };
    },
};
globalThis.fetch = ((input, init) => activeFetch(input, init)) as typeof fetch;

afterAll(() => {
    globalThis.fetch = realFetch;
    (globalThis as { Deno?: unknown }).Deno = realDeno;
});

describe("newsletter 1.0.0 source", () => {
    test("writes, lists, exports, and deletes subscriptions through the installed CMS source", async () => {
        const harness = await createHarness();

        const subscribed = await okJson(
            await sourceJson(harness, "setSubscription", {
                email: "USER@Example.COM ",
                subscribed: "true",
            }),
        );
        const listed = await okJson(
            await sourceRequest(harness, "listSubscriptions", {
                q: "user",
                subscribed: "true",
                limit: "10",
            }),
        );
        const fetched = await okJson(
            await sourceRequest(harness, "getSubscription", {
                email: "user@example.com",
            }),
        );
        const exported = await textBody(
            await sourceRequest(harness, "exportSubscriptions", {
                subscribed: "true",
            }),
        );
        const deleted = await okJson(
            await sourceDelete(harness, "deleteSubscription", {
                email: "user@example.com",
            }),
        );

        expect(subscribed).toMatchObject({
            exists: true,
            email: "user@example.com",
            subscribed: true,
        });
        expect(listed.subscriptions).toEqual([
            expect.objectContaining({ email: "user@example.com", subscribed: true }),
        ]);
        expect(listed.total).toBe(1);
        expect(fetched).toMatchObject({ exists: true, email: "user@example.com", subscribed: true });
        expect(exported).toContain("email,subscribed,createdAt,updatedAt");
        expect(exported).toContain("user@example.com,true");
        expect(deleted).toEqual({ deleted: true, email: "user@example.com" });
        expect(harness.rest.rows("subscriptions")).toEqual([]);
    });

    test("rejects invalid CMS keys and invalid subscription payloads", async () => {
        const harness = await createHarness();

        const unauthorized = await harness.sourceFetch(`${functionsBaseUrl}/cms-newsletter/health`, {
            headers: { authorization: "Bearer wrong" },
        });
        const invalid = await sourceJson(harness, "setSubscription", {
            email: "not-an-email",
            subscribed: true,
        });

        expect(unauthorized.status).toBe(401);
        expect(await jsonBody(unauthorized)).toEqual({ error: "invalid CMS API key" });
        expect(invalid.status).toBe(400);
        expect(await jsonBody(invalid)).toEqual({ error: "email is invalid" });
    });
});

async function createHarness() {
    const base = await importNewsletter();
    const functionSecrets = base.deployment?.functions[0]?.secrets ?? {};
    activeEnv = {
        ...Object.fromEntries(Object.entries(functionSecrets).map(([key, value]) => [key, String(value)])),
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: "supabase-secret-key" }),
    };

    const handler = await loadEdgeHandler();
    const rest = new NewsletterRestMock();
    activeFetch = async (input, init) => rest.fetch(input, init);

    return {
        ...base,
        rest,
        async sourceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            try {
                const request = requestFromFetchInput(input, init);
                if (!request.url.startsWith(`${functionsBaseUrl}/cms-newsletter/`)) {
                    throw new Error(`unexpected source proxy fetch: ${request.method} ${request.url}`);
                }
                return await handler(request);
            } catch (error) {
                return new Response(error instanceof Error ? (error.stack ?? error.message) : String(error), {
                    status: 599,
                });
            }
        },
        async resolveSecret(ref: string): Promise<string | undefined> {
            const key = secretRefToKey(ref) ?? ref;
            return (await base.secrets.get(key)) ?? undefined;
        },
    };
}

async function importNewsletter() {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("newsletter");
    if (!definition) {
        throw new Error("newsletter definition not found");
    }

    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const roles = new InMemoryRolesRepository();
    const dashboards = new InMemoryDashboardRepository();
    const importedBlocs: IntegrationBlocArtifact[] = [];
    let deployment: IntegrationConnectorDeployment | undefined;
    const deployer: IntegrationConnectorDeployer = {
        provider: "supabase",
        async deploy(next) {
            deployment = next;
            return {
                provider: "supabase",
                outputs: { functionsBaseUrl },
                resources: [
                    { type: "schema", id: "sql/schema.manifest.json", action: "applied" },
                    { type: "function", id: "cms-newsletter", action: "deployed" },
                ],
            };
        },
    };

    const result = await importIntegration(
        {
            sources,
            secrets,
            roles,
            dashboards,
            connectorDeployers: [deployer],
            blocs: {
                async importBloc(artifact) {
                    importedBlocs.push(artifact);
                    return { id: artifact.tag, action: "created" };
                },
            },
        },
        { kind: "newsletter", answers: { id: "newsletter" }, options: {} },
        [definition],
    );

    return { result, sources, secrets, dashboards, importedBlocs, deployment };
}

class NewsletterRestMock {
    private readonly tables: Record<string, JsonRecord[]> = {
        subscriptions: [],
    };

    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const request = requestFromFetchInput(input, init);
        const url = new URL(request.url);
        const method = request.method.toUpperCase();

        if (url.origin !== supabaseUrl || !url.pathname.startsWith("/rest/v1/")) {
            throw new Error(`unexpected fetch: ${method} ${request.url}`);
        }
        expect(request.headers.get("apikey")).toBe("supabase-secret-key");
        expect(request.headers.get("authorization")).toBe("Bearer supabase-secret-key");
        expect(request.headers.get("accept-profile")).toBe("newsletter");
        if (method !== "GET" && method !== "HEAD") {
            expect(request.headers.get("content-profile")).toBe("newsletter");
        }

        const table = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
        if (!this.tables[table]) {
            throw new Error(`unexpected table: ${table}`);
        }
        if (method === "GET") {
            return jsonResponse(this.select(table, url), 200, {
                "content-range": `0-${Math.max(this.select(table, url).length - 1, 0)}/${this.select(table, url).length}`,
            });
        }
        if (method === "POST") {
            const row = JSON.parse(await request.text()) as JsonRecord;
            const inserted = this.upsert(table, row);
            return jsonResponse([inserted], 201);
        }
        if (method === "DELETE") {
            const deleted = this.delete(table, url);
            return jsonResponse(deleted);
        }
        throw new Error(`unexpected method: ${method} ${request.url}`);
    }

    rows(table: string): JsonRecord[] {
        return this.tables[table]!.map((row) => ({ ...row }));
    }

    private select(table: string, url: URL): JsonRecord[] {
        let rows = this.tables[table]!;
        const email = filterValue(url.searchParams.get("email"));
        const subscribed = filterValue(url.searchParams.get("subscribed"));
        if (email?.operator === "eq") {
            rows = rows.filter((row) => same(row.email, email.value));
        }
        if (email?.operator === "ilike") {
            rows = rows.filter((row) =>
                String(row.email ?? "")
                    .toLowerCase()
                    .includes(email.value.replaceAll("*", "").toLowerCase()),
            );
        }
        if (subscribed?.operator === "eq") {
            rows = rows.filter((row) => String(row.subscribed) === subscribed.value);
        }
        return rows.map((row) => ({ ...row }));
    }

    private upsert(table: string, value: JsonRecord): JsonRecord {
        const rows = this.tables[table]!;
        const now = "2026-07-06T10:00:00.000Z";
        const index = rows.findIndex((row) => same(row.email, value.email));
        const next = {
            ...(index >= 0 ? rows[index] : { created_at: now }),
            ...value,
            updated_at: now,
        };
        if (index >= 0) {
            rows[index] = next;
        } else {
            rows.push(next);
        }
        return { ...next };
    }

    private delete(table: string, url: URL): JsonRecord[] {
        const rows = this.tables[table]!;
        const email = filterValue(url.searchParams.get("email"));
        const deleted: JsonRecord[] = [];
        this.tables[table] = rows.filter((row) => {
            const match = email?.operator === "eq" && same(row.email, email.value);
            if (match) {
                deleted.push({ email: row.email });
            }
            return !match;
        });
        return deleted;
    }
}

async function loadEdgeHandler(): Promise<EdgeHandler> {
    if (!edgeHandler) {
        await import(edgeFunctionUrl);
    }
    if (!edgeHandler) {
        throw new Error("cms-newsletter edge handler was not registered");
    }
    return edgeHandler;
}

async function sourceRequest(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    endpoint: string,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`${sourcePrefix}newsletter/${endpoint}`, "https://cms.test");
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return await handleSourceRequest(harness.sources, new Request(url), {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
            resolveContext: async () => ({ userID: "user-123" }),
        },
    });
}

async function sourceJson(
    harness: Awaited<ReturnType<typeof createHarness>>,
    endpoint: string,
    body: unknown,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`${sourcePrefix}newsletter/${endpoint}`, "https://cms.test");
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return await handleSourceRequest(
        harness.sources,
        new Request(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
        {
            prefix: sourcePrefix,
            deps: {
                fetchImpl: harness.sourceFetch,
                resolveSecret: harness.resolveSecret,
                resolveContext: async () => ({ userID: "user-123" }),
            },
        },
    );
}

async function sourceDelete(
    harness: Awaited<ReturnType<typeof createHarness>>,
    endpoint: string,
    params: Record<string, string>,
): Promise<Response> {
    const url = new URL(`${sourcePrefix}newsletter/${endpoint}`, "https://cms.test");
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return await handleSourceRequest(harness.sources, new Request(url, { method: "DELETE" }), {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
            resolveContext: async () => ({ userID: "user-123" }),
        },
    });
}

function requestFromFetchInput(input: RequestInfo | URL, init?: RequestInit): Request {
    return input instanceof Request ? input : new Request(input, init);
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}

function filterValue(value: string | null): { operator: string; value: string } | null {
    if (!value) {
        return null;
    }
    const [operator, ...rest] = value.split(".");
    return { operator: operator ?? "", value: rest.join(".") };
}

function same(a: unknown, b: unknown): boolean {
    return String(a) === String(b);
}

async function jsonBody(response: Response): Promise<JsonRecord> {
    return (await response.json()) as JsonRecord;
}

async function okJson(response: Response): Promise<JsonRecord> {
    const body = await jsonBody(response);
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    return body;
}

async function textBody(response: Response): Promise<string> {
    expect(response.status).toBe(200);
    return await response.text();
}
