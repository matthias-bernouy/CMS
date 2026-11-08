import { mountInstallations } from "../../installations/mount";
import { expect, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
const contractId = "ulvia/cms.observability";
test("user invocations cannot use Installations to forge a machine identity", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const issued: unknown[] = [];
    await mountInstallations(dispatcher, {
        gateway: {
            invocations: {
                issue: async (input: unknown) => {
                    issued.push(input);
                    return { token: "example--scoped--token", instanceId: "instance-a" };
                },
            },
        } as never,
    });
    const input = {
        requestId: crypto.randomUUID(),
        installationId: "provider-a",
        contractId,
        contractVersion: "1.0.0",
        capabilityId: "logs.append",
        systemServiceId: "cms-edge",
    };
    const context = {
        requestId: crypto.randomUUID(),
        contractVersion: "1.0.0",
        siteId: "default",
        providerId: "ulvia/primary-provider",
    };
    await expect(
        dispatcher.invoke("ulvia/cms.installations", "gateway.invocation.issue", input, context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(issued).toEqual([]);
    await dispatcher.invoke("ulvia/cms.installations", "gateway.invocation.issue", input, {
        ...context,
        controlAuthority: true,
    });
    expect(issued).toEqual([input]);
});
