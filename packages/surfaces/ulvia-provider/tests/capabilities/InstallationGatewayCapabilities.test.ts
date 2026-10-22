import { expect, test } from "bun:test";
import {
    DefaultProviderCapabilityDispatcher,
    type ProviderCapabilityInvocationContext,
    type UlviaProviderGateway,
} from "@bernouy/ulvia-provider";
import { registerProviderInstallationCapabilities } from "@bernouy/ulvia-provider/capabilities";

const context: ProviderCapabilityInvocationContext = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.0.0",
    siteId: "site-a",
    providerId: "ulvia.official",
};

test("installation capabilities expose the Gateway control operations", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const events: unknown[] = [];
    const issued: unknown[] = [];
    const route = { selection: { siteId: "site-a", contractId: "catalog.items" } };
    const gateway = {
        siteId: "site-a",
        routes: { resolve: async () => route },
        identities: { getOrCreate: async () => "provider-subject" },
        commandAudit: { append: async (event: unknown) => void events.push(event) },
        invocations: {
            issue: async (input: unknown) => {
                issued.push(input);
                return { token: "signed-provider-invocation", instanceId: "provider-instance" };
            },
        },
    } as unknown as UlviaProviderGateway;
    registerProviderInstallationCapabilities(dispatcher, gateway);

    expect(await invoke(dispatcher, "gateway.route.get", { contractId: "catalog.items" })).toEqual({
        route: JSON.stringify(route),
    });
    expect(
        await invoke(dispatcher, "gateway.identity.resolve", { providerId: "catalog", subjectId: "cms-user" }),
    ).toEqual({ providerSubjectId: "provider-subject" });
    expect(
        await invoke(dispatcher, "gateway.invocation.issue", {
            requestId: context.requestId,
            installationId: "installation-a",
            contractId: "catalog.items",
            contractVersion: "1.0.0",
            capabilityId: "products.list",
        }),
    ).toEqual({ token: "signed-provider-invocation", instanceId: "provider-instance" });
    expect(issued).toHaveLength(1);

    const event = {
        id: "audit-a",
        requestId: context.requestId,
        occurredAt: "2026-10-22T10:00:00.000Z",
        siteId: "site-a",
        installationId: "installation-a",
        contractId: "catalog.items",
        capabilityId: "products.create",
        actorKind: "administrator",
        stage: "started",
    };
    expect(await invoke(dispatcher, "gateway.audit.append", { event: JSON.stringify(event) })).toEqual({
        accepted: true,
    });
    expect(events).toEqual([event]);
});

async function invoke(
    dispatcher: DefaultProviderCapabilityDispatcher,
    capabilityId: string,
    input: Record<string, unknown>,
) {
    return dispatcher.invoke("ulvia.cms.installations", capabilityId, input, context);
}
