import { expect, test } from "bun:test";
import { GatewayError } from "@bernouy/cms-gateway";
import { schemaDescriptorWire, parseSchemaDescriptor } from "@bernouy/ulvia-contracts/resolution";
import { createSchemaVersionAuthority } from "../../../../src/runtime/gateway/native/schemaVersions";
import { gatewayRoute } from "../../../../../../../tests/integration/gateway/fixtures";

test("CMS schema authority fences exact source and actor before persisting any descriptor, including foreign instances", async () => {
    const base = await gatewayRoute();
    const capability = base.requestedRelease.admission.release.capabilities[0]!;
    const route = {
        ...base,
        requestedRelease: {
            ...base.requestedRelease,
            admission: {
                ...base.requestedRelease.admission,
                release: {
                    ...base.requestedRelease.admission.release,
                    capabilities: [{ ...capability, schemaResolver: { selector: capability.input } }],
                },
            },
        },
    };
    let allowed = true;
    let current = true;
    let writes = 0;
    const authority = createSchemaVersionAuthority(
        base.selection.siteId,
        { resolve: async () => route, isCurrent: async () => current },
        {
            assertAuthorized: async () => {
                if (!allowed) {
                    throw new GatewayError("not_authorized", "Denied");
                }
            },
        },
        {
            seal: async () => {
                writes++;
            },
        },
    );
    const installation = base.installation.installation;
    const descriptor = parseSchemaDescriptor(
        schemaDescriptorWire({ resourceId: "contact", version: "1", schema: { type: "boolean" }, fields: [] }),
    );
    const input = {
        actor: { kind: "anonymous" as const },
        descriptor,
        target: {
            installationId: installation.id,
            contractId: base.requestedRelease.admission.release.contractId,
            capabilityId: capability.id,
            endpoint: installation.endpoint,
            accountId: installation.accountId,
            instanceId: base.installation.observation!.report.instanceId,
            version: base.requestedRelease.admission.release.version,
            digest: base.requestedRelease.admission.digest,
        },
    };
    await authority.seal(input);
    expect(writes).toBe(1);
    allowed = false;
    await expect(authority.seal(input)).rejects.toHaveProperty("code", "not_authorized");
    allowed = true;
    for (const field of ["instanceId", "installationId", "digest", "endpoint", "accountId"] as const) {
        await expect(
            authority.seal({ ...input, target: { ...input.target, [field]: "foreign" } }),
        ).rejects.toHaveProperty("code", "stale_route");
    }
    await expect(
        authority.seal({ ...input, descriptor: { ...descriptor, digest: `sha256:${"0".repeat(64)}` } }),
    ).rejects.toHaveProperty("code", "INVALID_SCHEMA_DESCRIPTOR");
    current = false;
    await expect(authority.seal(input)).rejects.toHaveProperty("code", "stale_route");
    expect(writes).toBe(1);
});
