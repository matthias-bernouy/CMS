import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    ProviderDirectMigrationHandler,
    type IntegrationMigrationConnectorTransition,
    type IntegrationMigrationStepContext,
    type IntegrationProviderDirectMigrationAdapter,
} from "@bernouy/cms-integrations";

describe("provider-direct migration strategies", () => {
    test("records expand-in-code without invoking a provider mutation", async () => {
        const handler = new ProviderDirectMigrationHandler([]);
        const context = migrationContext("expand-in-code");

        const result = await handler.execute(context);
        const confirmation = await handler.confirm(context, result);

        expect(result.externalOperationId).toStartWith("provider-direct:");
        expect(confirmation).toEqual({ confirmed: true, externalOperationId: result.externalOperationId });
    });

    test("executes and confirms a journalled provider switch through its adapter", async () => {
        const calls: string[] = [];
        const adapter: IntegrationProviderDirectMigrationAdapter = {
            provider: "supabase",
            executeTransition: async (_context, connector, cutover) => {
                calls.push(`execute:${connector.connectorKey}:${cutover.callbackIds.join(",")}`);
                return { externalOperationId: "stripe-endpoint-2" };
            },
            confirmTransition: async (_context, connector, cutover, previous) => {
                calls.push(
                    `confirm:${connector.connectorKey}:${cutover.callbackIds.join(",")}:${previous.externalOperationId}`,
                );
                return true;
            },
        };
        const handler = new ProviderDirectMigrationHandler([adapter]);
        const context = migrationContext("journalled-provider-switch");

        const result = await handler.execute(context);
        const confirmation = await handler.confirm(context, result);

        expect(calls).toEqual(["execute:primary:stripe", "confirm:primary:stripe:stripe-endpoint-2"]);
        expect(confirmation.confirmed).toBeTrue();
    });

    test("rejects a substituted callback receipt before invoking the provider", async () => {
        let confirmations = 0;
        const adapter = providerAdapter({
            confirm: async () => {
                confirmations += 1;
                return true;
            },
        });
        const handler = new ProviderDirectMigrationHandler([adapter]);
        const context = migrationContext("journalled-provider-switch");
        const result = await handler.execute(context);
        const substituted = mutateReceipt(result.externalOperationId!, (receipt) => {
            receipt.operations[0]!.callbackIds = ["attacker-controlled"];
        });

        expect(await handler.confirm(context, { externalOperationId: substituted })).toEqual({ confirmed: false });
        expect(confirmations).toBe(0);
    });

    test("rejects malformed, non-canonical, and missing provider receipts", async () => {
        const handler = new ProviderDirectMigrationHandler([providerAdapter()]);
        const context = migrationContext("journalled-provider-switch");

        expect(await handler.confirm(context, { externalOperationId: "provider-direct:not-base64!" })).toEqual({
            confirmed: false,
        });
        expect(await handler.confirm(context, { externalOperationId: nonCanonicalReceipt() })).toEqual({
            confirmed: false,
        });
        expect(await handler.confirm(context, {})).toEqual({ confirmed: false });
        await expect(
            new ProviderDirectMigrationHandler([
                providerAdapter({ execute: async () => ({ externalOperationId: undefined }) }),
            ]).execute(context),
        ).rejects.toThrow("returned no durable operation id");
    });

    test("keeps a provider confirmation failure journalled and retryable", async () => {
        const handler = new ProviderDirectMigrationHandler([providerAdapter({ confirm: async () => false })]);
        const context = migrationContext("journalled-provider-switch");
        const result = await handler.execute(context);

        expect(await handler.confirm(context, result)).toEqual({ confirmed: false });
    });

    test("fails closed when a journalled provider switch has no adapter", async () => {
        const handler = new ProviderDirectMigrationHandler([]);

        await expect(handler.execute(migrationContext("journalled-provider-switch"))).rejects.toThrow(
            'provider-direct migration adapter "supabase" is not configured',
        );
    });
});

function providerAdapter(
    overrides: {
        execute?: IntegrationProviderDirectMigrationAdapter["executeTransition"];
        confirm?: IntegrationProviderDirectMigrationAdapter["confirmTransition"];
    } = {},
): IntegrationProviderDirectMigrationAdapter {
    return {
        provider: "supabase",
        executeTransition: overrides.execute ?? (async () => ({ externalOperationId: "stripe-endpoint-2" })),
        confirmTransition: overrides.confirm ?? (async () => true),
    };
}

function mutateReceipt(
    encoded: string,
    mutate: (receipt: { operations: Array<{ callbackIds: string[] }> }) => void,
): string {
    const prefix = "provider-direct:";
    const receipt = JSON.parse(Buffer.from(encoded.slice(prefix.length), "base64url").toString("utf8"));
    mutate(receipt);
    return `${prefix}${Buffer.from(canonicalJsonBytes(receipt)).toString("base64url")}`;
}

function nonCanonicalReceipt(): string {
    const document = '{ "schema": "cms.integration.provider-direct-receipt.v1", "operations": [] }';
    return `provider-direct:${Buffer.from(document).toString("base64url")}`;
}

function migrationContext(strategy: "expand-in-code" | "journalled-provider-switch"): IntegrationMigrationStepContext {
    const connector: IntegrationMigrationConnectorTransition = {
        connectorKey: "primary",
        provider: "supabase",
        lineageId: "commerce-v1",
        connectorInstanceId: "connector-instance-1",
        fromRevision: 1,
        toRevision: 2,
        plan: {
            install: { revision: 2, digest: `sha256:${"a".repeat(64)}`, coveredMigrations: [] },
            migrations: [],
            supportedSources: [{ range: "^1.0.0", migrationRevision: 1 }],
            providerDirect: { strategy, callbackIds: ["stripe"] },
            pointOfNoReturn: "before-contract",
        },
    };
    return {
        phase: "provider-direct-transition",
        targetDigest: "b".repeat(64),
        connectors: [connector],
        operation: {
            id: "migration-1",
            journal: [{ phase: "deploy-functions", status: "succeeded" }],
        },
    } as IntegrationMigrationStepContext;
}
