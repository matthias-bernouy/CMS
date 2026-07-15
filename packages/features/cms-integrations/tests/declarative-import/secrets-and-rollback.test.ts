import { describe, expect, test } from "bun:test";
import { importIntegration, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { writeSecretsWithRollback } from "cms-integrations/core/import/secretWrites";
import { DeleteFailingSecretStore, FailingCreateSourceRepository, sourceArtifact } from "../helpers";

describe("@bernouy/cms-integrations declarative imports", () => {
    test("rejects plaintext interpolation of secret answers in artifacts", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const definition: IntegrationDefinition = {
            kind: "leaky",
            label: "Leaky",
            inputs: [{ name: "apiKey", label: "API key", type: "password", required: true, secret: true }],
            secrets: [{ input: "apiKey", key: "API_KEY" }],
            artifacts: [{
                type: "source",
                source: {
                    id: "leaky",
                    meta: { name: "Leaky" },
                    endpoints: [{
                        endpointId: "list",
                        method: "GET",
                        targetUrl: "https://api.example.com/items",
                        params: [],
                        headers: [{ name: "authorization", source: { from: "static", value: "{{answers.apiKey}}" } }],
                    }],
                },
            }],
        };

        await expect(importIntegration(
            { sources, secrets },
            { kind: "leaky", answers: { apiKey: "secret" }, options: {} },
            [definition],
        )).rejects.toThrow(/secret answer "apiKey"/);

        expect(await sources.getSource("urn:leaky")).toBeNull();
        expect(await secrets.get("API_KEY")).toBeNull();
    });

    test("rolls back created sources and secrets when a later source write fails", async () => {
        const innerSources = new InMemorySourceRepository();
        const sources = new FailingCreateSourceRepository(innerSources, "urn:two");
        const secrets = new InMemorySecretStore();
        const definition: IntegrationDefinition = {
            kind: "two-sources",
            label: "Two sources",
            inputs: [{ name: "apiKey", label: "API key", type: "password", required: true, secret: true }],
            secrets: [{ input: "apiKey", key: "API_KEY" }],
            artifacts: [sourceArtifact("one"), sourceArtifact("two")],
        };

        await expect(importIntegration(
            { sources, secrets },
            { kind: "two-sources", answers: { apiKey: "secret" }, options: {} },
            [definition],
        )).rejects.toThrow(/create failed/);

        expect(await innerSources.getSource("urn:one")).toBeNull();
        expect(await secrets.get("API_KEY")).toBeNull();
    });

    test("validates resolved declarative secret keys before writing", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const definition: IntegrationDefinition = {
            kind: "bad-key",
            label: "Bad key",
            inputs: [
                { name: "id", label: "Id", type: "text", required: true },
                { name: "apiKey", label: "API key", type: "password", required: true, secret: true },
            ],
            secrets: [{ input: "apiKey", key: "{{answers.id}}-token" }],
            artifacts: [sourceArtifact("bad-key")],
        };

        await expect(importIntegration(
            { sources, secrets },
            { kind: "bad-key", answers: { id: "my service", apiKey: "secret" }, options: {} },
            [definition],
        )).rejects.toThrow(/secret key must match/);

        expect(await secrets.listKeys()).toEqual([]);
        expect(await sources.getSource("urn:bad-key")).toBeNull();
    });
});

describe("@bernouy/cms-integrations secret rollback", () => {
    test("continues restoring secrets when one rollback operation fails", async () => {
        const secrets = new DeleteFailingSecretStore();
        await secrets.set("A", "old");

        await expect(writeSecretsWithRollback(
            secrets,
            [{ key: "A", value: "new" }, { key: "B", value: "new" }],
            async () => {
                throw new Error("boom");
            },
        )).rejects.toThrow("boom");

        expect(await secrets.get("A")).toBe("old");
        expect(await secrets.get("B")).toBe("new");
    });
});
