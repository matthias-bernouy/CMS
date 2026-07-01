import { describe, expect, test } from "bun:test";
import {
    importIntegration,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemoryDashboardRepository, type Dashboard } from "@bernouy/cms-dashboards";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { writeSecretsWithRollback } from "cms-integrations/core/import/secretWrites";
import { DeleteFailingSecretStore, FailingCreateSourceRepository, sourceArtifact } from "./helpers";

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

    test("rejects duplicate source urns within one import before writing", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const definition: IntegrationDefinition = {
            kind: "duplicate-sources",
            label: "Duplicate Sources",
            inputs: [],
            artifacts: [sourceArtifact("same"), sourceArtifact("same")],
        };

        await expect(importIntegration(
            { sources, secrets },
            { kind: "duplicate-sources", answers: {}, options: {} },
            [definition],
        )).rejects.toThrow(/urn:same/);

        expect(await sources.getSource("urn:same")).toBeNull();
    });

    test("imports dashboards declared for sources owned by the same integration", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const dashboards = new InMemoryDashboardRepository();
        const definition: IntegrationDefinition = {
            kind: "source-dashboard",
            label: "Source dashboard",
            inputs: [],
            artifacts: [
                sourceArtifact("items"),
                dashboardArtifact("items-dashboard", "items"),
            ],
        };

        const result = await importIntegration(
            { sources, secrets, dashboards },
            { kind: "source-dashboard", answers: {}, options: {} },
            [definition],
        );

        expect(result.artifacts).toEqual([
            { type: "source", id: "urn:items", action: "created" },
            { type: "dashboard", id: "items-dashboard", action: "created" },
        ]);
        expect(await dashboards.getDashboard("items-dashboard")).toEqual(dashboardArtifact("items-dashboard", "items").dashboard);
    });

    test("rejects dashboards targeting sources not declared by the same integration", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const dashboards = new InMemoryDashboardRepository();
        const definition: IntegrationDefinition = {
            kind: "foreign-dashboard",
            label: "Foreign dashboard",
            inputs: [],
            artifacts: [
                sourceArtifact("owned"),
                dashboardArtifact("bad-dashboard", "foreign"),
            ],
        };

        await expect(importIntegration(
            { sources, secrets, dashboards },
            { kind: "foreign-dashboard", answers: {}, options: {} },
            [definition],
        )).rejects.toThrow(/references source "foreign" not declared by this integration/);

        expect(await sources.getSource("urn:owned")).toBeNull();
        expect(await dashboards.getDashboard("bad-dashboard")).toBeNull();
    });

    test("rolls back sources when dashboard writes fail", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const dashboards = new FailingCreateDashboardRepository("items-dashboard");
        const definition: IntegrationDefinition = {
            kind: "dashboard-fails",
            label: "Dashboard fails",
            inputs: [],
            artifacts: [
                sourceArtifact("items"),
                dashboardArtifact("items-dashboard", "items"),
            ],
        };

        await expect(importIntegration(
            { sources, secrets, dashboards },
            { kind: "dashboard-fails", answers: {}, options: {} },
            [definition],
        )).rejects.toThrow(/dashboard create failed/);

        expect(await sources.getSource("urn:items")).toBeNull();
        expect(await dashboards.getDashboard("items-dashboard")).toBeNull();
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

function dashboardArtifact(id: string, source: string) {
    return {
        type: "dashboard" as const,
        dashboard: {
            id,
            source,
            collections: [
                { id: "items", list: { endpoint: "list" } },
            ],
            views: [
                { widget: "w-table" as const, collection: "items" },
            ],
        },
    };
}

class FailingCreateDashboardRepository extends InMemoryDashboardRepository {
    constructor(private readonly failId: string) {
        super();
    }

    override createDashboard(dashboard: Dashboard): Promise<Dashboard> {
        if (dashboard.id === this.failId) throw new Error(`dashboard create failed for ${dashboard.id}`);
        return super.createDashboard(dashboard);
    }
}
