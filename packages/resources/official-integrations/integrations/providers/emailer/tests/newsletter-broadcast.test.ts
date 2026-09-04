import { describe, expect, test } from "bun:test";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
    type IntegrationConnectorDeployer,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { executeFunction, InMemoryFunctionRepository, validateFunction } from "@bernouy/cms-functions";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore, secretRefToKey } from "@bernouy/cms-secrets";
import { InMemorySourceRepository, makeEndpointUrn, type Source } from "@bernouy/cms-sources";

describe("emailer newsletter broadcast 1.0.0", () => {
    test("imports and sends one Emailer template to active Newsletter subscribers", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const functions = new InMemoryFunctionRepository();
        const installations = new InMemoryIntegrationInstallationRepository();
        await seedNewsletter({ sources, installations });

        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("emailer");
        if (!definition) {
            throw new Error("emailer definition not found");
        }
        const deployer: IntegrationConnectorDeployer = {
            provider: "supabase",
            async deploy(next) {
                return {
                    provider: "supabase",
                    outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
                    resources: next.functions.map((fn) => ({ type: "function", id: fn.name, action: "deployed" })),
                };
            },
        };

        const result = await importIntegration(
            {
                sources,
                secrets,
                functions,
                installations,
                dashboards: new InMemoryDashboardRepository(),
                roles: new InMemoryRolesRepository(),
                connectorDeployers: [deployer],
            },
            { kind: "emailer", answers: { id: "emailer" }, options: {} },
            [definition],
        );
        const fn = await functions.getFunction("sendNewsletterBroadcast");
        const requests: Request[] = [];

        expect(result.artifacts).toContainEqual({ type: "function", id: "sendNewsletterBroadcast", action: "created" });
        expect(fn).toBeTruthy();
        expect(await validateFunction(fn!, { sources })).toEqual([]);
        expect(fn?.ui?.execute?.fields).toMatchObject([
            { control: "text", path: "body.campaignKey" },
            { control: "source-select", path: "body.templateKey", source: "emailer", endpoint: "listTemplates" },
            { control: "json-object", path: "body.data", seed: { source: "emailer", endpoint: "getTemplate" } },
        ]);

        const data = { campaign: { title: "Week 1" } };
        const response = await executeFunction(
            fn!,
            new Request("https://cms.test/functions/sendNewsletterBroadcast", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ campaignKey: "weekly-1", templateKey: "weekly.digest", data }),
            }),
            {
                sources,
                deps: {
                    fetchImpl: async (input, init) => {
                        const request = input instanceof Request ? input : new Request(input, init);
                        requests.push(request);
                        const url = new URL(request.url);
                        if (url.origin === "https://newsletter.test") {
                            expect(url.searchParams.get("subscribed")).toBe("true");
                            expect(url.searchParams.get("limit")).toBe("25");
                            return json({ subscriptions: subscribers(), total: 2 });
                        }
                        if (url.pathname.endsWith("/cms-emailer/template/send")) {
                            expect(request.headers.get("authorization")).toMatch(/^Bearer cms_em_/);
                            const body = (await request.json()) as EmailerBody;
                            return json({
                                status: "sent",
                                templateKey: body.key,
                                toEmails: body.toEmails,
                                data: body.data,
                                idempotencyKey: body.idempotencyKey,
                            });
                        }
                        return new Response("not found", { status: 404 });
                    },
                    resolveSecret: async (ref) => (await secrets.get(secretRefToKey(ref) ?? ref)) ?? undefined,
                },
            },
        );

        expect(response.status).toBe(200);
        const payload = (await response.json()) as { subscribers: { email: string }[]; messages: BroadcastMessage[] };
        expect(payload.subscribers.map((item) => item.email)).toEqual(["ada@example.test", "bea@example.test"]);
        expect(payload.messages.map((item) => item.message.idempotencyKey)).toEqual([
            "weekly-1:ada@example.test",
            "weekly-1:bea@example.test",
        ]);
        expect(payload.messages.map((item) => item.message.data)).toEqual([data, data]);
        expect(requests.map((request) => `${request.method} ${new URL(request.url).origin}`)).toEqual([
            "GET https://newsletter.test",
            "POST https://project.supabase.co",
            "POST https://project.supabase.co",
        ]);
    });
});

async function seedNewsletter(deps: {
    sources: InMemorySourceRepository;
    installations: InMemoryIntegrationInstallationRepository;
}): Promise<void> {
    await deps.sources.createSource(newsletterSource());
    await deps.installations.create({
        id: "newsletter",
        label: "Newsletter",
        definitionVersion: "3.0.0",
        status: "success",
        answersSnapshot: { id: "newsletter" },
        secretRefs: {},
        secretInputs: [],
        artifacts: [{ type: "source", id: "urn:newsletter", action: "created" }],
        runs: [],
    });
}

function newsletterSource(): Source {
    return {
        urn: "urn:newsletter",
        meta: { name: "Newsletter" },
        endpoints: [
            {
                urn: makeEndpointUrn("newsletter", "listSubscriptions"),
                method: "GET",
                targetUrl: "https://newsletter.test/subscriptions",
                input: {
                    params: [
                        { name: "subscribed", in: "query", schema: { type: "string" } },
                        { name: "limit", in: "query", schema: { type: "number" } },
                    ],
                },
                output: [{ status: "200", body: newsletterOutputShape() }],
            },
        ],
    };
}

function newsletterOutputShape() {
    return {
        type: "object" as const,
        properties: {
            subscriptions: {
                type: "array" as const,
                items: { type: "object" as const, properties: { email: { type: "string" as const } } },
            },
            total: { type: "number" as const },
        },
    };
}

function subscribers() {
    return [
        { email: "ada@example.test", subscribed: true },
        { email: "bea@example.test", subscribed: true },
    ];
}
type EmailerBody = { key: string; toEmails: string[]; data: unknown; idempotencyKey: string };
type BroadcastMessage = { message: { data: unknown; idempotencyKey: string } };

function json(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
