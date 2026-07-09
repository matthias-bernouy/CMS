import { afterAll, describe, expect, test } from "bun:test";
import {
    importIntegration,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryDashboardRepository, validateDashboard } from "@bernouy/cms-dashboards";
import {
    handleSourceRequest,
    InMemorySourceRepository,
    validateSource,
    type SourceRepository,
} from "@bernouy/cms-sources";
import { InMemorySecretStore, secretRefToKey } from "@bernouy/cms-secrets";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";

type EdgeHandler = (request: Request) => Response | Promise<Response>;
type JsonRecord = Record<string, unknown>;
type EmailTransport = {
    sendMail(input: JsonRecord): Promise<{ messageId?: string; response?: string }>;
};

const sourcePrefix = "/.cms/sources/";
const functionsBaseUrl = "https://project.supabase.co/functions/v1";
const supabaseUrl = "https://project.supabase.co";
const edgeFunctionUrl = "../integrations/emailer/versions/1.0.0/connectors/supabase/functions/cms-emailer/index.ts";
const providerFunctionSecrets = {
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "smtp-user",
    SMTP_PASSWORD: "smtp-password",
    SMTP_FROM: "no-reply@example.test",
    SMTP_REPLY_TO: "support@example.test",
};

const realFetch = globalThis.fetch;
const realDeno = (globalThis as { Deno?: unknown }).Deno;
const realTransport = (globalThis as { __CMS_EMAILER_TRANSPORT__?: EmailTransport }).__CMS_EMAILER_TRANSPORT__;
let activeEnv: Record<string, string> = {};
let activeFetch: typeof fetch = realFetch;
let edgeHandler: EdgeHandler | undefined;

(globalThis as { Deno?: { env: { get: (key: string) => string | undefined }; serve: (handler: EdgeHandler) => unknown } }).Deno = {
    env: { get: (key) => activeEnv[key] },
    serve(handler) {
        edgeHandler = handler;
        return { shutdown() { /* test stub */ } };
    },
};
globalThis.fetch = ((input, init) => activeFetch(input, init)) as typeof fetch;

afterAll(() => {
    globalThis.fetch = realFetch;
    (globalThis as { Deno?: unknown }).Deno = realDeno;
    (globalThis as { __CMS_EMAILER_TRANSPORT__?: EmailTransport }).__CMS_EMAILER_TRANSPORT__ = realTransport;
});

describe("emailer 1.0.0 source", () => {
    test("installs source, dashboard, connector, and system send endpoint", async () => {
        const harness = await createHarness();
        const source = await harness.sources.getSource("urn:emailer");
        const templatesDashboard = await harness.dashboards.getDashboard("emailer-templates");
        const settingsDashboard = await harness.dashboards.getDashboard("emailer-settings");

        expect(source).toBeTruthy();
        expect(validateSource(source!)).toEqual([]);
        expect(templatesDashboard).toBeTruthy();
        expect(settingsDashboard).toBeTruthy();
        expect(validateDashboard(templatesDashboard!, { source })).toEqual([]);
        expect(validateDashboard(settingsDashboard!, { source })).toEqual([]);
        const dashboardJson = JSON.stringify(templatesDashboard);
        const settingsJson = JSON.stringify(settingsDashboard);
        expect(dashboardJson).toContain("newTemplate");
        expect(dashboardJson).toContain("sendTestEmail");
        expect(dashboardJson).not.toContain("messagesTable");
        expect(dashboardJson).not.toContain("textBody");
        expect(dashboardJson).not.toContain("sampleDataJson");
        expect(settingsJson).toContain("emailerSettings");
        expect(harness.deployment?.dataApiSchemas).toEqual(["emailer"]);
        expect(harness.deployment?.functions.map(fn => fn.name)).toEqual(["cms-emailer"]);
        expect(String(harness.deployment?.functions[0]?.secrets?.CMS_EMAILER_API_KEY)).toStartWith("cms_em_");
        expect(harness.deployment?.functions[0]?.secrets).toMatchObject({
            SMTP_HOST: "smtp.example.test",
            SMTP_PORT: "587",
            SMTP_SECURE: "false",
            SMTP_USER: "smtp-user",
            SMTP_PASSWORD: "smtp-password",
            SMTP_FROM: "no-reply@example.test",
            SMTP_REPLY_TO: "support@example.test",
        });
        expect(harness.result.secrets?.map(secret => secret.key)).toEqual(["EMAILER_EMAILER_API_KEY"]);
        const sendEndpoint = source?.endpoints.find(endpoint => endpoint.urn === "urn:emailer:sendTemplateEmail");
        expect(sendEndpoint?.access).toEqual({ mode: "system" });
    });

    test("exposes provider settings and template defaults without leaking SMTP secrets", async () => {
        const harness = await createHarness();
        const settings = await okJson(await sourceRequest(harness, "getSettings"));
        const defaults = await okJson(await sourceRequest(harness, "getTemplate", { key: "__new__" }));
        const emptyDefaults = await okJson(await sourceRequest(harness, "getTemplate", { key: "" }));

        expect(settings).toMatchObject({
            provider: "supabase",
            functionName: "cms-emailer",
            smtpHost: "smtp.example.test",
            smtpPort: "587",
            smtpSecure: "false",
            smtpUser: "smtp-user",
            smtpPasswordConfigured: "configured",
            smtpPassword: "",
            defaultFrom: "no-reply@example.test",
            defaultReplyTo: "support@example.test",
        });
        expect(defaults).toMatchObject({
            key: "__new__",
            status: "draft",
            htmlBody: "<p>Hello {{ user.name }}</p>",
            testRecipient: "",
        });
        expect(emptyDefaults).toMatchObject({ key: "__new__", status: "draft" });
    });

    test("updates provider SMTP settings without exposing the saved password", async () => {
        const harness = await createHarness();
        const updated = await okJson(await sourceJson(harness, "updateSettings", {
            smtpHost: "smtp.saved.test",
            smtpPort: "2525",
            smtpSecure: "true",
            smtpUser: "saved-user",
            smtpPassword: "saved-password",
            defaultFrom: "saved@example.test",
            defaultReplyTo: "reply@example.test",
        }));
        const afterBlankPasswordSave = await okJson(await sourceJson(harness, "updateSettings", {
            smtpHost: "smtp.saved.test",
            smtpPort: "2525",
            smtpSecure: "true",
            smtpUser: "saved-user",
            smtpPassword: "",
            defaultFrom: "saved@example.test",
            defaultReplyTo: "reply@example.test",
        }));
        const settings = await okJson(await sourceRequest(harness, "getSettings"));

        expect(updated).toMatchObject({
            smtpHost: "smtp.saved.test",
            smtpPort: "2525",
            smtpSecure: "true",
            smtpUser: "saved-user",
            smtpPassword: "",
            smtpPasswordConfigured: "configured",
            defaultFrom: "saved@example.test",
            defaultReplyTo: "reply@example.test",
        });
        expect(afterBlankPasswordSave).toMatchObject({ smtpPassword: "", smtpPasswordConfigured: "configured" });
        expect(settings).toMatchObject({ smtpHost: "smtp.saved.test", smtpPassword: "", smtpPasswordConfigured: "configured" });
        expect(harness.rest.rows("settings")[0]).toMatchObject({
            smtp_host: "smtp.saved.test",
            smtp_port: 2525,
            smtp_secure: true,
            smtp_user: "saved-user",
            smtp_password: "saved-password",
            default_from: "saved@example.test",
            default_reply_to: "reply@example.test",
        });
    });

    test("writes, renders, sends, logs, and archives templates through the installed CMS source", async () => {
        const harness = await createHarness();
        const sent: JsonRecord[] = [];
        (globalThis as { __CMS_EMAILER_TRANSPORT__?: EmailTransport }).__CMS_EMAILER_TRANSPORT__ = {
            async sendMail(input) {
                sent.push(input);
                return { messageId: `smtp-${sent.length}` };
            },
        };

        const saved = await okJson(await sourceJson(harness, "upsertTemplate", welcomeTemplate()));
        const created = await okJson(await sourceJson(harness, "upsertTemplate", {
            key: "billing.receipt",
            name: "Receipt email",
            status: "draft",
            subject: "Receipt {{ order.number }}",
            htmlBody: "<p>Receipt {{ order.number }}</p>",
            requiredTokens: [
                { name: "order.number", description: "Order number", sample: "A-100" },
            ],
        }));
        const listed = await okJson(await sourceRequest(harness, "listTemplates", { q: "welcome" }));
        const fetched = await okJson(await sourceRequest(harness, "getTemplate", { key: "auth.welcome" }));
        const rendered = await okJson(await sourceJson(harness, "renderTemplate", {
            key: "auth.welcome",
            data: { user: { name: "Bea" } },
        }));
        const testMessage = await okJson(await sourceJson(harness, "sendTestEmail", {
            key: "auth.welcome",
            toEmail: "TEST@Example.COM",
        }));
        const createdTestMessage = await okJson(await sourceJson(harness, "sendTestEmail", {
            key: "billing.receipt",
            toEmail: "receipt@example.test",
        }));
        const systemMessage = await okJson(await sourceJson(harness, "sendTemplateEmail", {
            key: "auth.welcome",
            toEmails: ["buyer@example.test"],
            data: { user: { name: "Bea" } },
            idempotencyKey: "welcome-1",
        }));
        const messages = await okJson(await sourceRequest(harness, "listMessages", { status: "sent" }));
        const archived = await okJson(await sourceJson(harness, "archiveTemplate", {}, { key: "auth.welcome" }));

        expect(saved).toMatchObject({ key: "auth.welcome", name: "Welcome email", status: "active" });
        expect(created).toMatchObject({ key: "billing.receipt", name: "Receipt email", status: "draft" });
        expect(listed.items).toContainEqual(expect.objectContaining({ key: "auth.welcome" }));
        expect(String(fetched.sampleDataJson)).toContain("Ada");
        expect(rendered).toMatchObject({
            key: "auth.welcome",
            subject: "Welcome Bea",
            htmlBody: "<p>Hello Bea</p>",
            textBody: "Hello Bea",
        });
        expect(testMessage).toMatchObject({ status: "sent", providerMessageId: "smtp-1" });
        expect(createdTestMessage).toMatchObject({ status: "sent", providerMessageId: "smtp-2" });
        expect(systemMessage).toMatchObject({ status: "sent", providerMessageId: "smtp-3", idempotencyKey: "welcome-1" });
        expect(messages.total).toBe(3);
        expect(sent).toHaveLength(3);
        expect(sent[0]).toMatchObject({
            to: ["test@example.com"],
            subject: "Welcome Ada",
            html: "<p>Hello Ada</p>",
        });
        expect(sent[1]).toMatchObject({
            to: ["receipt@example.test"],
            subject: "Receipt A-100",
        });
        expect(sent[2]).toMatchObject({
            to: ["buyer@example.test"],
            subject: "Welcome Bea",
        });
        expect(archived).toMatchObject({ key: "auth.welcome", status: "archived" });
    });

    test("rejects invalid CMS keys, malformed tokens, and missing required tokens", async () => {
        const harness = await createHarness();
        const unauthorized = await harness.sourceFetch(`${functionsBaseUrl}/cms-emailer/health`, {
            headers: { authorization: "Bearer wrong" },
        });
        const malformed = await sourceJson(harness, "upsertTemplate", {
            ...welcomeTemplate(),
            subject: "Welcome {{ user-name }}",
        });
        await okJson(await sourceJson(harness, "upsertTemplate", welcomeTemplate()));
        const missingToken = await sourceJson(harness, "sendTemplateEmail", {
            key: "auth.welcome",
            toEmails: ["buyer@example.test"],
            data: { user: {} },
        });

        expect(unauthorized.status).toBe(401);
        expect(await jsonBody(unauthorized)).toEqual({ error: "invalid CMS API key" });
        expect(malformed.status).toBe(400);
        expect(await jsonBody(malformed)).toEqual({ error: "subject contains an invalid token" });
        expect(missingToken.status).toBe(400);
        expect(await jsonBody(missingToken)).toEqual({ error: "missing required token: user.name" });
    });

    test("records failed messages when SMTP delivery fails", async () => {
        const harness = await createHarness();
        await okJson(await sourceJson(harness, "upsertTemplate", welcomeTemplate()));
        (globalThis as { __CMS_EMAILER_TRANSPORT__?: EmailTransport }).__CMS_EMAILER_TRANSPORT__ = {
            async sendMail() {
                throw new Error("smtp offline");
            },
        };

        const failed = await sourceJson(harness, "sendTestEmail", {
            key: "auth.welcome",
            toEmail: "test@example.test",
        });
        const messages = await okJson(await sourceRequest(harness, "listMessages", { status: "failed" }));

        expect(failed.status).toBe(502);
        expect(await jsonBody(failed)).toEqual({ error: "smtp offline" });
        expect(messages.items).toEqual([expect.objectContaining({ status: "failed", error: "smtp offline" })]);
        expect(harness.rest.rows("messages")).toEqual([expect.objectContaining({ status: "failed", error: "smtp offline" })]);
    });
});

async function createHarness() {
    const base = await importEmailer();
    const functionSecrets = base.deployment?.functions[0]?.secrets ?? {};
    activeEnv = {
        ...Object.fromEntries(Object.entries(functionSecrets).map(([key, value]) => [key, String(value)])),
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: "supabase-secret-key" }),
    };

    const handler = await loadEdgeHandler();
    const rest = new EmailerRestMock();
    activeFetch = async (input, init) => rest.fetch(input, init);

    return {
        ...base,
        rest,
        async sourceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            try {
                const request = requestFromFetchInput(input, init);
                if (!request.url.startsWith(`${functionsBaseUrl}/cms-emailer/`)) {
                    throw new Error(`unexpected source proxy fetch: ${request.method} ${request.url}`);
                }
                return await handler(request);
            } catch (error) {
                return new Response(error instanceof Error ? error.stack ?? error.message : String(error), { status: 599 });
            }
        },
        async resolveSecret(ref: string): Promise<string | undefined> {
            const key = secretRefToKey(ref) ?? ref;
            return await base.secrets.get(key) ?? undefined;
        },
    };
}

async function importEmailer() {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("emailer");
    if (!definition) throw new Error("emailer definition not found");

    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const roles = new InMemoryRolesRepository();
    const dashboards = new InMemoryDashboardRepository();
    let deployment: IntegrationConnectorDeployment | undefined;
    const deployer: IntegrationConnectorDeployer = {
        provider: "supabase",
        async deploy(next) {
            deployment = {
                ...next,
                functions: next.functions.map(fn => ({
                    ...fn,
                    secrets: {
                        ...providerFunctionSecrets,
                        ...(fn.secrets ?? {}),
                    },
                })),
            };
            return {
                provider: "supabase",
                outputs: { functionsBaseUrl },
                resources: [
                    { type: "schema", id: "schema.sql", action: "applied" },
                    { type: "function", id: "cms-emailer", action: "deployed" },
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
        },
        {
            kind: "emailer",
            answers: {
                id: "emailer",
            },
            options: {},
        },
        [definition],
    );

    return { result, sources, secrets, dashboards, deployment };
}

class EmailerRestMock {
    private readonly tables: Record<string, JsonRecord[]> = {
        templates: [],
        messages: [],
        settings: [{
            id: "default",
            smtp_host: null,
            smtp_port: null,
            smtp_secure: null,
            smtp_user: null,
            smtp_password: null,
            default_from: null,
            default_reply_to: null,
            created_at: "2026-07-09T10:00:00.000Z",
            updated_at: "2026-07-09T10:00:00.000Z",
        }],
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
        expect(request.headers.get("accept-profile")).toBe("emailer");
        if (method !== "GET" && method !== "HEAD") expect(request.headers.get("content-profile")).toBe("emailer");

        const table = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
        if (!this.tables[table]) throw new Error(`unexpected table: ${table}`);
        if (method === "GET") {
            const rows = this.select(table, url);
            return jsonResponse(rows, 200, { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
        }
        if (method === "POST") {
            const row = JSON.parse(await request.text()) as JsonRecord;
            return jsonResponse([this.insertOrUpsert(table, row)], 201);
        }
        if (method === "PATCH") {
            const row = JSON.parse(await request.text()) as JsonRecord;
            return jsonResponse(this.patch(table, url, row), 200);
        }
        throw new Error(`unexpected method: ${method} ${request.url}`);
    }

    rows(table: string): JsonRecord[] {
        return this.tables[table]!.map(row => ({ ...row }));
    }

    private select(table: string, url: URL): JsonRecord[] {
        let rows = this.tables[table]!;
        for (const key of ["key", "id", "idempotency_key", "status", "template_key"]) {
            const filter = filterValue(url.searchParams.get(key));
            if (filter?.operator === "eq") rows = rows.filter(row => same(row[key], filter.value));
        }
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? rows.length);
        return rows.slice(offset, offset + limit).map(row => ({ ...row }));
    }

    private insertOrUpsert(table: string, value: JsonRecord): JsonRecord {
        const rows = this.tables[table]!;
        const now = "2026-07-09T10:00:00.000Z";
        if (table === "templates") {
            const index = rows.findIndex(row => same(row.key, value.key));
            const next = {
                ...(index >= 0 ? rows[index] : { created_at: now }),
                ...value,
                updated_at: now,
            };
            if (index >= 0) rows[index] = next;
            else rows.push(next);
            return { ...next };
        }
        if (table === "settings") {
            const id = String(value.id ?? "default");
            const index = rows.findIndex(row => same(row.id, id));
            const next = {
                ...(index >= 0 ? rows[index] : { id, created_at: now }),
                ...value,
                updated_at: now,
            };
            if (index >= 0) rows[index] = next;
            else rows.push(next);
            return { ...next };
        }
        const next = {
            created_at: now,
            updated_at: now,
            ...value,
        };
        rows.push(next);
        return { ...next };
    }

    private patch(table: string, url: URL, value: JsonRecord): JsonRecord[] {
        const rows = this.tables[table]!;
        const key = filterValue(url.searchParams.get("key"));
        const patched: JsonRecord[] = [];
        this.tables[table] = rows.map(row => {
            const match = key?.operator === "eq" && same(row.key, key.value);
            if (!match) return row;
            const next = { ...row, ...value, updated_at: "2026-07-09T10:00:00.000Z" };
            patched.push(next);
            return next;
        });
        return patched;
    }
}

function welcomeTemplate(): JsonRecord {
    return {
        key: "auth.welcome",
        name: "Welcome email",
        status: "active",
        subject: "Welcome {{ user.name }}",
        htmlBody: "<p>Hello {{ user.name }}</p>",
        textBody: "Hello {{ user.name }}",
        requiredTokens: [
            { name: "user.name", description: "Recipient display name", sample: "Ada" },
        ],
        sampleDataJson: JSON.stringify({ user: { name: "Ada" } }),
    };
}

async function loadEdgeHandler(): Promise<EdgeHandler> {
    if (!edgeHandler) await import(edgeFunctionUrl);
    if (!edgeHandler) throw new Error("cms-emailer edge handler was not registered");
    return edgeHandler;
}

async function sourceRequest(
    harness: { sources: SourceRepository; sourceFetch: typeof fetch; resolveSecret: (ref: string) => Promise<string | undefined> },
    endpoint: string,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`${sourcePrefix}emailer/${endpoint}`, "https://cms.test");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return await handleSourceRequest(harness.sources, new Request(url), {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
        },
    });
}

async function sourceJson(
    harness: Awaited<ReturnType<typeof createHarness>>,
    endpoint: string,
    body: unknown,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`${sourcePrefix}emailer/${endpoint}`, "https://cms.test");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return await handleSourceRequest(harness.sources, new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    }), {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
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
    if (!value) return null;
    const [operator, ...rest] = value.split(".");
    return { operator: operator ?? "", value: rest.join(".") };
}

function same(a: unknown, b: unknown): boolean {
    return String(a) === String(b);
}

async function jsonBody(response: Response): Promise<JsonRecord> {
    return await response.json() as JsonRecord;
}

async function okJson(response: Response): Promise<JsonRecord> {
    const body = await jsonBody(response);
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    return body;
}
