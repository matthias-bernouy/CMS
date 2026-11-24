import { expect, test } from "bun:test";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { schemaDescriptorWire } from "@bernouy/ulvia-contracts/resolution";
import { dynamicFixture, value } from "./fixture";
import { observedRoute } from "../../provider/support/route";
import { SITE, INSTANCE } from "../../provider/support/network";
test("the CMS rejects schema changes even when the external Provider skips every SDK seal", async () => {
    const f = dynamicFixture();
    const build = await compileProvider(f.provider);
    const route = observedRoute(build, "http://127.0.0.1:5103", SITE, INSTANCE, f.feature.contractId);
    let changed = false;
    let business = 0;
    const options = {
        routes: { resolve: async () => route, isCurrent: async () => true },
        authorize: async () => true,
        schemaVersions: {
            seal: ({
                target,
                descriptor,
            }: Parameters<
                NonNullable<ConstructorParameters<typeof CapabilityGateway>[0]["schemaVersions"]>["seal"]
            >[0]) =>
                f.versions.seal(
                    {
                        siteId: SITE,
                        providerId: build.manifest.manifest.providerId,
                        instanceId: target.instanceId,
                        installationId: target.installationId,
                        contractId: target.contractId,
                        resolverId: target.capabilityId,
                    },
                    descriptor,
                ),
        },
        transport: {
            send: async (request: { capability: { id: string } }) => {
                if (request.capability.id !== f.resolver.id) {
                    business++;
                    return { status: 200, output: { echo: value.payload } };
                }
                return {
                    status: 200,
                    output: schemaDescriptorWire({
                        resourceId: "contact",
                        version: "1",
                        fields: [],
                        schema: {
                            type: "object",
                            properties: { email: changed ? { type: "boolean" } : { type: "string", maxLength: 64 } },
                            required: ["email"],
                        },
                    }),
                };
            },
        },
    };
    const invoke = () =>
        new CapabilityGateway(options).invoke({
            siteId: SITE,
            contractId: f.feature.contractId,
            capabilityId: "read",
            input: value,
            actor: { kind: "anonymous" },
        });
    expect(await invoke()).toMatchObject({ output: { echo: value.payload } });
    expect(business).toBe(1);
    changed = true;
    await expect(invoke()).rejects.toHaveProperty("code", "SCHEMA_VERSION_CONFLICT");
    expect(business).toBe(1);
});
