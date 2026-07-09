import { describe, expect, test } from "bun:test";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { executeFunction, InMemoryFunctionRepository, validateFunction } from "@bernouy/cms-functions";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository, makeEndpointUrn, makeSourceUrn, type Source } from "@bernouy/cms-sources";

describe("newsletter emailer broadcast 1.0.0", () => {
    test("imports and sends one Emailer template to active Newsletter subscribers", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const functions = new InMemoryFunctionRepository();
        const installations = new InMemoryIntegrationInstallationRepository();
        await seedDependencies({ sources, installations });

        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("newsletter-emailer-broadcast");
        if (!definition) throw new Error("newsletter-emailer-broadcast definition not found");

        const result = await importIntegration(
            { sources, secrets, functions, installations },
            { kind: "newsletter-emailer-broadcast", answers: {}, options: {} },
            [definition],
        );
        const fn = await functions.getFunction("sendNewsletterBroadcast");
        const requests: Request[] = [];

        expect(result.artifacts).toEqual([{ type: "function", id: "sendNewsletterBroadcast", action: "created" }]);
        expect(fn).toBeTruthy();
        expect(await validateFunction(fn!, { sources })).toEqual([]);
        expect(fn?.ui?.execute?.fields).toMatchObject([
            { control: "source-select", path: "body.templateKey", source: "emailer", endpoint: "listTemplates" },
            { control: "json-object", path: "body.data", seed: { source: "emailer", endpoint: "getTemplate" } },
        ]);

        const response = await executeFunction(fn!, new Request("https://cms.test/functions/sendNewsletterBroadcast", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                templateKey: "weekly.digest",
                data: { campaign: { title: "Week 1" } },
            }),
        }), {
            sources,
            deps: {
                fetchImpl: async (input, init) => {
                    const request = input instanceof Request ? input : new Request(input, init);
                    requests.push(request);
                    const url = new URL(request.url);
                    if (url.origin === "https://newsletter.test") {
                        expect(url.searchParams.get("subscribed")).toBe("true");
                        expect(url.searchParams.get("limit")).toBe("25");
                        return json({
                            subscriptions: [
                                { email: "ada@example.test", subscribed: true },
                                { email: "bea@example.test", subscribed: true },
                            ],
                            total: 2,
                        });
                    }
                    if (url.origin === "https://emailer.test") {
                        const body = await request.json() as { key: string; toEmails: string[]; data: unknown };
                        return json({
                            status: "sent",
                            templateKey: body.key,
                            toEmails: body.toEmails,
                            data: body.data,
                        });
                    }
                    return new Response("not found", { status: 404 });
                },
            },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            subscribers: [
                { email: "ada@example.test", subscribed: true },
                { email: "bea@example.test", subscribed: true },
            ],
            messages: [
                {
                    email: "ada@example.test",
                    message: {
                        status: "sent",
                        templateKey: "weekly.digest",
                        toEmails: ["ada@example.test"],
                        data: { campaign: { title: "Week 1" } },
                    },
                },
                {
                    email: "bea@example.test",
                    message: {
                        status: "sent",
                        templateKey: "weekly.digest",
                        toEmails: ["bea@example.test"],
                        data: { campaign: { title: "Week 1" } },
                    },
                },
            ],
        });
        expect(requests.map(request => `${request.method} ${new URL(request.url).origin}`)).toEqual([
            "GET https://newsletter.test",
            "POST https://emailer.test",
            "POST https://emailer.test",
        ]);
    });
});

async function seedDependencies(deps: {
    sources: InMemorySourceRepository;
    installations: InMemoryIntegrationInstallationRepository;
}): Promise<void> {
    await deps.sources.createSource(newsletterSource());
    await deps.sources.createSource(emailerSource());
    await deps.installations.create({
        id: "newsletter",
        label: "Newsletter",
        definitionVersion: "1.0.0",
        status: "success",
        answersSnapshot: { id: "newsletter" },
        secretRefs: {},
        secretInputs: [],
        artifacts: [{ type: "source", id: "urn:newsletter", action: "created" }],
        runs: [],
    });
    await deps.installations.create({
        id: "emailer",
        label: "Emailer",
        definitionVersion: "1.0.0",
        status: "success",
        answersSnapshot: { id: "emailer" },
        secretRefs: {},
        secretInputs: [],
        artifacts: [{ type: "source", id: "urn:emailer", action: "created" }],
        runs: [],
    });
}

function newsletterSource(): Source {
    return {
        urn: makeSourceUrn("newsletter"),
        meta: { name: "Newsletter" },
        endpoints: [{
            urn: makeEndpointUrn("newsletter", "listSubscriptions"),
            method: "GET",
            targetUrl: "https://newsletter.test/subscriptions",
            input: {
                params: [
                    { name: "subscribed", in: "query", schema: { type: "string" } },
                    { name: "limit", in: "query", schema: { type: "number" } },
                ],
            },
            output: [{
                status: "200",
                body: {
                    type: "object",
                    properties: {
                        subscriptions: {
                            type: "array",
                            items: { type: "object", properties: { email: { type: "string" } } },
                        },
                        total: { type: "number" },
                    },
                },
            }],
        }],
    };
}

function emailerSource(): Source {
    return {
        urn: makeSourceUrn("emailer"),
        meta: { name: "Emailer" },
        endpoints: [{
            urn: makeEndpointUrn("emailer", "sendTemplateEmail"),
            method: "POST",
            targetUrl: "https://emailer.test/template/send",
            input: {
                params: [],
                body: {
                    type: "object",
                    properties: {
                        key: { type: "string" },
                        toEmails: { type: "array", items: { type: "string" } },
                        data: { type: "object" },
                    },
                    required: ["key", "toEmails"],
                },
            },
            output: [{ status: "200", body: { type: "object" } }],
        }],
    };
}

function json(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
