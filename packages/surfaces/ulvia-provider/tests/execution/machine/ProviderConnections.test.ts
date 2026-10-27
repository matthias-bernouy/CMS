import { compileProviderRoutes } from "../../../src/transport/routes";
import { contractRelease, resolveFixtureContract } from "../../ulviaProviderFixture";
import { ProviderClientError } from "@bernouy/cms-gateway/provider";
import { createConnectedProviderLogger } from "@bernouy/ulvia-provider/sdk/node";
import type { ContractRelease } from "@bernouy/cms-repository/contracts";
import { expect, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerProviderInstallationCapabilities } from "@bernouy/ulvia-provider/capabilities";
import { registerProviderConnectionCapabilities } from "@bernouy/ulvia-provider/sdk/node";

const context = {
    requestId: crypto.randomUUID(),
    siteId: "site-a",
    providerId: "provider-a",
    contractVersion: "1.0.0",
};

test("only verified connection authority can configure its own return channel", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const configured: unknown[] = [];
    registerProviderConnectionCapabilities(dispatcher, {
        configure: async (value) => {
            configured.push(value);
            return { connectionId: value.connectionId, configured: true };
        },
    });
    const input = { connectionId: "connection-a", cmsUrl: "https://cms.example", token: "a".repeat(64), generation: 1 };
    for (const authority of [
        {},
        { connectionId: "other" },
        { connectionId: "connection-a", sourceInstallationId: "caller" },
        { connectionId: "connection-a", subjectId: "user" },
        { connectionId: "connection-a", systemServiceId: "cms-kernel" },
    ]) {
        await expect(
            dispatcher.invoke("ulvia.provider.connections", "connections.configure", input, {
                ...context,
                ...authority,
            }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(configured).toEqual([]);
    expect(
        await dispatcher.invoke("ulvia.provider.connections", "connections.configure", input, {
            ...context,
            connectionId: "connection-a",
        }),
    ).toEqual({ connectionId: "connection-a", configured: true });
    expect(configured).toEqual([input]);
});

test("Provider actors cannot approve installations or look up other Providers' credentials", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    let called = false;
    registerProviderInstallationCapabilities(
        dispatcher,
        {
            providers: {
                authenticate: async () => {
                    called = true;
                    return "other";
                },
                authorize: async () => {
                    called = true;
                    return true;
                },
            },
        } as never,
        {
            administration: {
                approve: async () => {
                    called = true;
                    return {};
                },
            },
        } as never,
    );
    for (const authority of [{}, { sourceInstallationId: "caller" }, { systemServiceId: "cms-kernel" }]) {
        await expect(
            dispatcher.invoke(
                "ulvia.cms.installations",
                "approve-provider-connection",
                { ticket: "ticket" },
                { ...context, ...authority },
            ),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
            dispatcher.invoke(
                "ulvia.cms.installations",
                "gateway.provider.resolve",
                { token: "a".repeat(64) },
                { ...context, ...authority },
            ),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(called).toBe(false);
});

test("an approval ticket owned by another administrator is a permanent authorization refusal", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerProviderInstallationCapabilities(dispatcher, undefined, {
        administration: {
            approve: async () => {
                throw Object.assign(new Error("Not this administrator"), { status: 403 });
            },
        },
    } as never);
    await expect(
        dispatcher.invoke(
            "ulvia.cms.installations",
            "approve-provider-connection",
            { ticket: "ticket" },
            { ...context, subjectId: "admin-b" },
        ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
});

test("the connected logger drops permanent Gateway failures and retries an uncertain idempotent append", async () => {
    for (const code of ["invalid_input", "outcome_unknown"]) {
        let attempts = 0;
        const diagnostics = createConnectedProviderLogger({
            client: {
                invoke: async () => {
                    attempts++;
                    throw new ProviderClientError(code, false, 409);
                },
            },
            contract: { contractId: "ulvia.cms.observability" } as ContractRelease,
            service: "test",
            fallback: () => undefined,
        });
        diagnostics.logger.info("test.failed");
        await diagnostics.collector.flush();
        expect(diagnostics.collector.stats().queued).toBe(code === "invalid_input" ? 0 : 1);
        await diagnostics.collector.flush();
        expect(attempts).toBe(1);
        await diagnostics.collector.close(1);
    }
});

test("the official Provider mounts the connection contract alongside CMS contracts", async () => {
    const contract = structuredClone(await contractRelease());
    const resolved = structuredClone(resolveFixtureContract(contract));
    (resolved.release as { contractId: string }).contractId = "ulvia.provider.connections";
    expect(compileProviderRoutes([resolved])).not.toBeEmpty();
    (resolved.release as { contractId: string }).contractId = "unrelated.provider.contract";
    expect(() => compileProviderRoutes([resolved])).toThrow("only accepts");
});

test("Providers cannot use internal Gateway control capabilities to escape their requires", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerProviderInstallationCapabilities(dispatcher, {} as never);
    for (const capability of [
        "gateway.route.get",
        "gateway.identity.resolve",
        "gateway.audit.append",
        "gateway.invocation.issue",
    ]) {
        for (const actor of [{ sourceInstallationId: "source-a" }, { subjectId: "admin-a" }, {}]) {
            await expect(
                dispatcher.invoke("ulvia.cms.installations", capability, {}, { ...context, ...actor }),
            ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
        }
    }
});
