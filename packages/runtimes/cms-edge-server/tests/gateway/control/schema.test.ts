import { expect, test } from "bun:test";
import { ControlProviderClient } from "../../../src/runtime/gateway/ControlProviderClient";
import { InstallationsProviderTransport } from "../../../src/runtime/gateway/InstallationsProviderTransport";
import { parseSchemaDescriptor, schemaDescriptorWire } from "@bernouy/ulvia-contracts/resolution";
const descriptor = parseSchemaDescriptor(
    schemaDescriptorWire({ resourceId: "contact", version: "1", fields: [], schema: { type: "boolean" } }),
);
const input = {
    actor: { kind: "anonymous" as const },
    descriptor,
    target: {
        installationId: "installed",
        contractId: "example/forms",
        capabilityId: "describe",
        version: "1.0.0",
        digest: `sha256:${"a".repeat(64)}`,
        endpoint: "https://forms.example",
        accountId: "account",
        instanceId: "instance",
    },
};
test("the stateless Edge obtains CMS confirmation without repairing a descriptor or hiding a version conflict", async () => {
    let calls = 0;
    let status = 200;
    const client = new ControlProviderClient(
        new InstallationsProviderTransport("http://control.test:5103", "control-" + "t".repeat(40), (async (
            url,
            init,
        ) => {
            calls++;
            expect(new URL(url.toString()).pathname).toBe("/gateway/schemas/seal");
            expect(new Headers(init?.headers).get("x-ulvia-capability-id")).toBe("gateway.schemas.seal");
            const wire = JSON.parse(String(init?.body));
            expect(wire.target).toEqual(input.target);
            expect(parseSchemaDescriptor(wire.descriptor)).toEqual(descriptor);
            return Response.json({ sealed: true }, { status });
        }) as typeof fetch),
    );
    await client.sealSchema(input);
    await expect(
        client.sealSchema({ ...input, descriptor: { ...descriptor, digest: `sha256:${"0".repeat(64)}` } }),
    ).rejects.toHaveProperty("code", "INVALID_SCHEMA_DESCRIPTOR");
    expect(calls).toBe(1);
    status = 409;
    await expect(client.sealSchema(input)).rejects.toHaveProperty("code", "SCHEMA_VERSION_CONFLICT");
    status = 403;
    await expect(client.sealSchema(input)).rejects.toHaveProperty("status", 403);
});
