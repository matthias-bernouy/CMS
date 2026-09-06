import { describe, expect, test } from "bun:test";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";
import { definition, fixture } from "./fixture";
describe("integration management authorization", () => {
    test("accepts zero-input manifests and rejects arbitrary or unowned function bindings", () => {
        const { inputs: _inputs, ...manifest } = definition;
        expect(parseIntegrationDefinition(manifest).inputs).toEqual([]);
        expect(() =>
            parseIntegrationDefinition({
                ...manifest,
                management: { schemaVersion: 1, health: { functionId: "https://example.test" } },
            }),
        ).toThrow();
        expect(() =>
            parseIntegrationDefinition({
                ...manifest,
                management: { schemaVersion: 1, health: { functionId: "unowned" } },
            }),
        ).toThrow("owned system POST");
        expect(() =>
            parseIntegrationDefinition({ ...manifest, inputs: [{ type: "text", name: "key", label: "Key" }] }),
        ).toThrow("installation inputs");
    });
    test("rejects raw settings secrets and undeclared actions before function execution", async () => {
        let calls = 0;
        const { service } = await fixture(async () => {
            calls++;
            return {};
        });
        await expect(service.saveSettings("test-management", { values: { key: "sk_private" } })).rejects.toThrow(
            "exact secret reference",
        );
        await expect(service.action("test-management", "https://evil.test")).rejects.toThrow(
            "declared management action",
        );
        expect(calls).toBe(0);
    });
    test("rejects writes to selected refs and strips echoed authorized secret values", async () => {
        const { service, secrets } = await fixture(async (_installation, _fn, payload) =>
            payload.operation === "save-settings"
                ? { values: { key: "${SELECTED_KEY}" }, echo: payload.secretValues.key }
                : { generatedSecrets: { key: "replace-user-secret" } },
        );
        expect(await service.saveSettings("test-management", { values: { key: "${SELECTED_KEY}" } })).toEqual({
            values: { key: "${SELECTED_KEY}" },
            echo: "[REDACTED]",
        });
        await expect(service.action("test-management", "apply-settings")).rejects.toThrow("not authorized");
        expect(await secrets.get("SELECTED_KEY")).toBe("selected-private-value");
    });
    test("resolves declared published page fields and ignores client-supplied resolved metadata", async () => {
        const { service, installations } = await fixture(
            async (_installation, _fn, payload) => ({ resolved: payload.resolvedPages, actor: payload.actor }),
            {
                resolvePublishedPage: async (path) => ({
                    id: "published-123",
                    path,
                    title: "Trusted",
                    content: [],
                    publishedSnapshotUrl: "https://site.test/snapshot/123",
                }),
            },
        );
        const installation = (await installations.get("test-management"))!;
        installation.definitionSnapshot!.management!.settings!.fields = [
            {
                id: "documents",
                label: "Documents",
                path: "documents",
                type: "reorderable-list",
                itemKey: "id",
                fields: [{ id: "page", label: "Page", path: "page", type: "page-link", publishedOnly: true }],
            },
        ];
        await installations.replace(installation);
        const result = await service.saveSettings(
            "test-management",
            { documents: [{ page: "/legal" }], resolvedPages: { evil: true } },
            { id: "admin", role: "admin" },
        );
        expect(result).toMatchObject({
            resolved: { "documents.0.page": { id: "published-123", title: "Trusted" } },
            actor: { id: "admin", role: "admin" },
        });
    });
});
