import { describe, expect, test } from "bun:test";
import { importIntegration, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import {
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    SourceOverlaySourceRepository,
    type Source,
} from "@bernouy/cms-sources";
import { buildSourceWrites } from "cms-integrations/core/import/declarative/builders/artifactWrites/sourceWrites";
import { writeSourcesWithRollback } from "cms-integrations/core/import/writes/sourceWrites";
import { writeSecretsWithRollback } from "cms-integrations/core/import/writes/secretWrites";
import { DeleteFailingSecretStore, FailingCreateSourceRepository, sourceArtifact } from "../../helpers";

describe("@bernouy/cms-integrations declarative imports", () => {
    test("rejects plaintext interpolation of secret answers in artifacts", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const definition: IntegrationDefinition = {
            kind: "leaky",
            label: "Leaky",
            inputs: [{ name: "apiKey", label: "API key", type: "password", required: true, secret: true }],
            secrets: [{ input: "apiKey", key: "API_KEY" }],
            artifacts: [
                {
                    type: "source",
                    source: {
                        id: "leaky",
                        meta: { name: "Leaky" },
                        endpoints: [
                            {
                                endpointId: "list",
                                method: "GET",
                                targetUrl: "https://api.example.com/items",
                                params: [],
                                output: [{ status: "200", body: { type: "object" } }],
                                headers: [
                                    { name: "authorization", source: { from: "static", value: "{{answers.apiKey}}" } },
                                ],
                            },
                        ],
                    },
                },
            ],
        };

        await expect(
            importIntegration({ sources, secrets }, { kind: "leaky", answers: { apiKey: "secret" }, options: {} }, [
                definition,
            ]),
        ).rejects.toThrow(/secret answer "apiKey"/);

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

        await expect(
            importIntegration(
                { sources, secrets },
                { kind: "two-sources", answers: { apiKey: "secret" }, options: {} },
                [definition],
            ),
        ).rejects.toThrow(/create failed/);

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

        await expect(
            importIntegration(
                { sources, secrets },
                { kind: "bad-key", answers: { id: "my service", apiKey: "secret" }, options: {} },
                [definition],
            ),
        ).rejects.toThrow(/secret key must match/);

        expect(await secrets.listKeys()).toEqual([]);
        expect(await sources.getSource("urn:bad-key")).toBeNull();
    });

    test("restores the persisted Source without materializing overlay fields on rollback", async () => {
        const stored = new InMemorySourceRepository();
        const original = sourceWithTarget("https://commerce.example.test/v1/products");
        await stored.createSource(original);
        const overlays = new InMemorySourceOverlayRepository();
        await overlays.upsertOverlay({
            id: "commerce-brand",
            sourceId: "commerce",
            output: [{ endpointId: "products" }],
            fields: [{ id: "brand", label: "Brand", type: "string", path: "brand" }],
        });
        const sources = new SourceOverlaySourceRepository(stored, overlays);
        const secrets = new InMemorySecretStore();
        const writes = await buildSourceWrites(
            { sources, secrets },
            [sourceWithTarget("https://commerce.example.test/v2/products")],
            { force: true },
        );

        await expect(
            writeSourcesWithRollback(sources, writes, async () => {
                throw new Error("later artifact failed");
            }),
        ).rejects.toThrow("later artifact failed");

        expect(await stored.getSource(original.urn)).toEqual(original);
        expect(
            (await stored.getSource(original.urn))?.endpoints[0]?.output?.[0]?.body?.properties?.brand,
        ).toBeUndefined();
    });
});

describe("@bernouy/cms-integrations secret rollback", () => {
    test("continues restoring secrets when one rollback operation fails", async () => {
        const secrets = new DeleteFailingSecretStore();
        await secrets.set("A", "old");

        await expect(
            writeSecretsWithRollback(
                secrets,
                [
                    { key: "A", value: "new" },
                    { key: "B", value: "new" },
                ],
                async () => {
                    throw new Error("boom");
                },
            ),
        ).rejects.toThrow("boom");

        expect(await secrets.get("A")).toBe("old");
        expect(await secrets.get("B")).toBe("new");
    });
});

function sourceWithTarget(targetUrl: string): Source {
    return {
        urn: "urn:commerce",
        identityAuthority: "commerce",
        endpoints: [
            {
                urn: "urn:commerce:products",
                method: "GET",
                targetUrl,
                output: [{ status: "200", body: { type: "object", properties: { id: { type: "string" } } } }],
            },
        ],
    };
}
