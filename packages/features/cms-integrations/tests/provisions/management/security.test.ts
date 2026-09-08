import { endpointFixture } from "./support/endpoint";
import { describe, expect, test } from "bun:test";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";
import { definition, fixture } from "./support/fixture";

describe("integration endpoint authorization", () => {
    test("rejects the removed settings contract and unowned function bindings", () => {
        const { inputs: _inputs, ...manifest } = definition;
        expect(parseIntegrationDefinition(manifest).inputs).toEqual([]);
        for (const functionId of ["https://example.test", "unowned"]) {
            expect(() =>
                parseIntegrationDefinition({ ...manifest, management: { schemaVersion: 1, health: { functionId } } }),
            ).toThrow();
        }
        expect(() =>
            parseIntegrationDefinition({ ...manifest, management: { schemaVersion: 1, settings: {} } }),
        ).toThrow("settings is obsolete");
        expect(() =>
            parseIntegrationDefinition({ ...manifest, inputs: [{ type: "text", name: "key", label: "Key" }] }),
        ).toThrow("installation inputs");
    });
    test("rejects raw secrets and forged context before executing the endpoint", async () => {
        let calls = 0;
        const { write } = await endpointFixture(() => {
            calls++;
            return {};
        });
        await expect(write({ values: { key: "sk_private" } })).rejects.toThrow("exact secret reference");
        await expect(write({ _cms: { secretValues: { key: "forged" } } })).rejects.toThrow("server-owned");
        const { service } = await fixture(async () => {
            calls++;
            return {};
        });
        await expect(service.action("test-management", "https://evil.test")).rejects.toThrow(
            "declared management action",
        );
        expect(calls).toBe(0);
    });
    test("strips private context and echoed secrets and rejects replacing a selected secret", async () => {
        let bad = false;
        const { write, secrets } = await endpointFixture(({ _cms }) =>
            bad
                ? { _cms: { generatedSecrets: { key: "replace-user-secret" } } }
                : { echo: _cms.secretValues.key, _cms: { rememberSecrets: true } },
        );
        expect(await write({ values: { key: "${SELECTED_KEY}" } })).toEqual({
            status: 200,
            body: { echo: "[REDACTED]" },
        });
        bad = true;
        await expect(write({ values: {} })).rejects.toThrow("not authorized");
        expect(await secrets.get("SELECTED_KEY")).toBe("selected-private-value");
    });
    test("resolves published page fields from the installed view and forwards the verified actor", async () => {
        const context = await endpointFixture(({ _cms }) => ({ resolved: _cms.resolvedPages, actor: _cms.actor }), {
            resolvePublishedPage: async (path) => ({
                id: "published-123",
                path,
                title: "Trusted",
                content: [],
                publishedSnapshotUrl: "https://site.test/snapshot/123",
            }),
        });
        await context.fields([
            {
                id: "documents",
                label: "Documents",
                path: "documents",
                type: "reorderable-list",
                itemKey: "id",
                fields: [{ id: "page", label: "Page", path: "page", type: "page-link", publishedOnly: true }],
            },
        ]);
        expect(
            (await context.write({ documents: [{ page: "/legal" }], resolvedPages: { evil: true } })).body,
        ).toMatchObject({
            resolved: { "documents.0.page": { id: "published-123", title: "Trusted" } },
            actor: { id: "admin", role: "admin" },
        });
    });
    test("hidden page fields do not prevent disabling after a page was removed", async () => {
        let resolutions = 0;
        const context = await endpointFixture(() => ({}), {
            resolvePublishedPage: async () => {
                resolutions++;
                return null;
            },
        });
        await context.fields([
            { id: "enabled", label: "Enabled", path: "enabled", type: "checkbox" },
            {
                id: "page",
                label: "Page",
                path: "page",
                type: "page-link",
                visibleWhen: { value: "$field.enabled", equals: true },
            },
        ]);
        await context.write({ enabled: false, page: "/deleted" });
        expect(resolutions).toBe(0);
        await expect(context.write({ enabled: true, page: "/deleted" })).rejects.toThrow("missing or unpublished");
        expect(resolutions).toBe(1);
    });
    test("clearing list rows revokes their grants without deleting stored keys", async () => {
        const context = await endpointFixture(() => ({ _cms: { rememberSecrets: true } }));
        await context.fields([
            {
                id: "accounts",
                label: "Accounts",
                path: "accounts",
                type: "reorderable-list",
                itemKey: "id",
                fields: [{ id: "key", label: "Key", path: "key", type: "secret-ref" }],
            },
        ]);
        await context.write({ accounts: [{ key: "${SELECTED_KEY}" }, { key: "${OTHER_KEY}" }] });
        await context.write({ accounts: [{ key: "${SELECTED_KEY}" }] });
        expect((await context.installations.get(definition.kind))?.managementSecretRefs).toEqual({
            "accounts.0.key": "${SELECTED_KEY}",
        });
        await context.write({ accounts: [] });
        expect((await context.installations.get(definition.kind))?.managementSecretRefs).toEqual({});
        expect(await context.secrets.get("OTHER_KEY")).toBe("other-private-value");
    });
    test("continuations are bounded and failed responses never execute effects", async () => {
        let calls = 0;
        const context = await endpointFixture(() => {
            calls++;
            return { _cms: { continue: { again: true } } };
        });
        await expect(context.write({ values: {} })).rejects.toThrow("continuation limit");
        expect(calls).toBe(4);
        const failed = await endpointFixture(() =>
            Response.json(
                { error: "conflict", _cms: { generatedSecrets: { signing: "must-not-write" } } },
                { status: 409 },
            ),
        );
        expect(await failed.write({ values: {} })).toEqual({ status: 409, body: { error: "conflict" } });
        expect(await failed.secrets.get("MANAGED_SIGNING")).toBe("old-signing");
    });
});
