import { describe, expect, test } from "bun:test";
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
                    `confirm:${connector.connectorKey}:${cutover.callbackIds.join(",")}:${previous.externalOperationId?.startsWith("provider-direct:")}`,
                );
                return true;
            },
        };
        const handler = new ProviderDirectMigrationHandler([adapter]);
        const context = migrationContext("journalled-provider-switch");

        const result = await handler.execute(context);
        const confirmation = await handler.confirm(context, result);

        expect(calls).toEqual(["execute:primary:stripe", "confirm:primary:stripe:true"]);
        expect(confirmation.confirmed).toBeTrue();
    });

    test("fails closed when a journalled provider switch has no adapter", async () => {
        const handler = new ProviderDirectMigrationHandler([]);

        await expect(handler.execute(migrationContext("journalled-provider-switch"))).rejects.toThrow(
            'provider-direct migration adapter "supabase" is not configured',
        );
    });
});

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
