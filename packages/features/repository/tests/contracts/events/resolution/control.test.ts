import { expect, test } from "bun:test";
import { executeCapability } from "@bernouy/ulvia-sdk/local";
import { SchemaResolutionError, schemaDescriptorWire } from "@bernouy/ulvia-contracts/resolution";
import { gatewaySchemaSeal } from "repository/application/installations/capabilities/gateway/resolution/gateway.schemas.seal";
import type { InstallationGateway } from "repository/application/installations/interfaces/gateway";
const context = {
    requestId: "test",
    contractVersion: "1.7.0",
    siteId: "default",
    providerId: "ulvia/primary-provider",
};
const input = {
    actor: { kind: "anonymous" as const },
    target: {
        installationId: "installation",
        contractId: "example/forms",
        capabilityId: "describe",
        version: "1.0.0",
        digest: `sha256:${"a".repeat(64)}`,
        endpoint: "https://provider.example",
        accountId: "account",
        instanceId: "instance",
    },
    descriptor: schemaDescriptorWire({ resourceId: "contact", version: "1", schema: { type: "boolean" }, fields: [] }),
};
test("schema seals require Edge control authority; invalid descriptors and conflicts remain explicit", async () => {
    let writes = 0;
    let conflict = false;
    const services = {
        gateway: {
            schemaVersions: {
                seal: async () => {
                    if (conflict) {
                        throw new SchemaResolutionError("SCHEMA_VERSION_CONFLICT");
                    }
                    writes++;
                },
            },
        } as unknown as InstallationGateway,
    };
    await expect(executeCapability(gatewaySchemaSeal, { input, services, context })).rejects.toHaveProperty(
        "code",
        "FORBIDDEN",
    );
    expect(writes).toBe(0);
    const control = { ...context, controlAuthority: true };
    await expect(
        executeCapability(gatewaySchemaSeal, {
            input: { ...input, descriptor: { ...input.descriptor, schemaJson: "null" } },
            services,
            context: control,
        }),
    ).rejects.toHaveProperty("code", "INVALID_INPUT");
    expect(writes).toBe(0);
    expect(await executeCapability(gatewaySchemaSeal, { input, services, context: control })).toEqual({ sealed: true });
    conflict = true;
    await expect(executeCapability(gatewaySchemaSeal, { input, services, context: control })).rejects.toMatchObject({
        code: "SCHEMA_VERSION_CONFLICT",
    });
    expect(gatewaySchemaSeal.errors.SCHEMA_VERSION_CONFLICT.retryable).toBe(false);
    expect(writes).toBe(1);
});
