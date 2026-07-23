import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationInstallationRepository,
    parseIntegrationDefinition,
    runIntegrationInstallation,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { producerDefinition, targetDefinition } from "./afterInstallationFixtures";

describe("@bernouy/cms-integrations afterInstallation", () => {
    test("parses dependency-gated declarative steps", () => {
        const definition = parseIntegrationDefinition(producerDefinition());
        expect(definition.afterInstallation).toEqual([
            {
                id: "sync-templates",
                requires: ["target"],
                steps: expect.any(Array),
            },
        ]);
    });

    test("reconciles a waiting hook when its optional dependency is installed later", async () => {
        const sources = new InMemorySourceRepository();
        const installations = new InMemoryIntegrationInstallationRepository();
        const secrets = new InMemorySecretStore();
        const calls: Array<{ url: string; body?: unknown }> = [];
        const definitions = [producerDefinition(), targetDefinition()];
        const deps = {
            sources,
            installations,
            secrets,
            sourceExecutorDeps: {
                fetchImpl: async (input: string | URL | Request, init?: RequestInit) => {
                    const request = new Request(input, init);
                    calls.push({
                        url: request.url,
                        ...(request.method === "POST" ? { body: await request.clone().json() } : {}),
                    });
                    if (request.url.endsWith("/templates")) {
                        return Response.json({ items: [{ key: "order-paid" }] });
                    }
                    return Response.json({ accepted: 1 });
                },
            },
        };

        await runIntegrationInstallation({
            mode: "create",
            deps,
            installations,
            siteIntegrations: definitions,
            dto: { kind: "producer", answers: { id: "producer-source" }, options: {} },
        });
        expect(calls).toEqual([]);

        await runIntegrationInstallation({
            mode: "create",
            deps,
            installations,
            siteIntegrations: definitions,
            dto: { kind: "target", answers: { id: "target-source" }, options: {} },
        });

        expect(calls).toEqual([
            { url: "https://producer.test/templates" },
            {
                url: "https://target.test/templates/install",
                body: { templates: [{ key: "order-paid" }] },
            },
        ]);
    });
});
