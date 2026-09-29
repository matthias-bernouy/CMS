import { describe, expect, test } from "bun:test";
import {
    CapabilityGateway,
    GatewayError,
    type GatewayActor,
    type GatewayRoute,
    type GatewayTransportRequest,
    type GatewayTransportResponse,
} from "@bernouy/cms-gateway";
import { InMemoryIdentityService, ProviderIdentityAliases } from "@bernouy/cms-gateway/identity";
import { gatewayRoute, NOW } from "./fixtures";

function harness(route: GatewayRoute, identities = new ProviderIdentityAliases(new InMemoryIdentityService())) {
    const sent: GatewayTransportRequest[] = [];
    let current = true;
    let response: GatewayTransportResponse = {
        status: 200,
        contentType: "application/json",
        output: { items: ["one"] },
    };
    const gateway = new CapabilityGateway({
        routes: {
            resolve: async () => route,
            isCurrent: async () => current,
        },
        transport: {
            send: async (request) => {
                sent.push(request);
                return response;
            },
        },
        authorize: async () => true,
        identities,
        now: () => NOW,
    });
    return {
        gateway,
        sent,
        identities,
        setCurrent: (value: boolean) => {
            current = value;
        },
        setResponse: (value: GatewayTransportResponse) => {
            response = value;
        },
    };
}

function invocation(actor: GatewayActor = { kind: "anonymous" }, input: unknown = { term: "one" }) {
    return {
        siteId: "site-a",
        contractId: "catalog",
        capabilityId: "item.list",
        origin: "delivery" as const,
        actor,
        input,
    };
}

describe("capability gateway", () => {
    test("uses exact release pins and projects a valid query response", async () => {
        const scope = harness(await gatewayRoute());
        scope.setResponse({
            status: 200,
            contentType: "application/json; charset=utf-8",
            output: { items: ["one"], extra: true },
        });
        const result = await scope.gateway.invoke(invocation());
        expect(result).toMatchObject({ kind: "success", status: 200, output: { items: ["one"] } });
        expect(result.output).not.toHaveProperty("extra");
        expect(result.requestId).toMatch(/^[0-9a-f-]{36}$/);
        expect(scope.sent).toHaveLength(1);
        expect(scope.sent[0]).toMatchObject({
            endpoint: "https://provider.example.com",
            providerTokenRef: "${PROVIDER_TOKEN}",
            actorKind: "anonymous",
            input: { term: "one" },
        });
    });

    test("snapshots input before waiting for route resolution", async () => {
        const scope = harness(await gatewayRoute());
        const input = { term: "before" };
        const pending = scope.gateway.invoke(invocation(undefined, input));
        input.term = "after";
        await pending;
        expect(scope.sent[0]?.input).toEqual({ term: "before" });
    });

    test("rejects pin mismatches, disabled installations, and absent readiness", async () => {
        const route = await gatewayRoute();
        for (const candidate of [
            { ...route, selection: { ...route.selection, digest: "sha256:wrong" } },
            {
                ...route,
                installation: {
                    ...route.installation,
                    installation: { ...route.installation.installation, status: "disabled" },
                },
            },
            { ...route, installation: { ...route.installation, observation: undefined } },
            {
                ...route,
                installation: {
                    ...route.installation,
                    installation: { ...route.installation.installation, endpoint: "https://provider.example.com/path" },
                },
            },
        ]) {
            const scope = harness(candidate as GatewayRoute);
            await expect(scope.gateway.invoke(invocation())).rejects.toBeInstanceOf(GatewayError);
            expect(scope.sent).toHaveLength(0);
        }
    });

    test("uses provider identity and hides CMS subject IDs from transport", async () => {
        const route = await gatewayRoute({ access: "authenticated" });
        const scope = harness(route);
        await expect(scope.gateway.invoke(invocation())).rejects.toMatchObject({ code: "not_authorized" });
        await scope.gateway.invoke(invocation({ kind: "user", subjectId: "cms-user-1" }));
        const alias = scope.sent[0]?.providerSubjectId;
        expect(alias).toMatch(/^[0-9a-f-]{36}$/);
        expect(JSON.stringify(scope.sent[0])).not.toContain("cms-user-1");
        expect(await scope.identities.resolve({ providerId: "ulvia.example" }, alias!)).toBe("cms-user-1");
        expect(await scope.identities.resolve({ providerId: "other.example" }, alias!)).toBeNull();

        const otherInstallation = harness(
            {
                ...route,
                selection: { ...route.selection, siteId: "site-b", installationId: "install-b" },
                installation: {
                    ...route.installation,
                    installation: { ...route.installation.installation, siteId: "site-b", id: "install-b" },
                },
            },
            scope.identities,
        );
        await otherInstallation.gateway.invoke({
            ...invocation({ kind: "user", subjectId: "cms-user-1" }),
            siteId: "site-b",
        });
        expect(otherInstallation.sent[0]?.providerSubjectId).toBe(alias);
    });

    test("fails closed on stale routes, commands, and malformed provider responses", async () => {
        const scope = harness(await gatewayRoute());
        scope.setCurrent(false);
        await expect(scope.gateway.invoke(invocation())).rejects.toMatchObject({ code: "stale_route" });
        expect(scope.sent).toHaveLength(0);
        scope.setCurrent(true);
        scope.setResponse({ status: 200, contentType: "application/json", output: { items: [42] } });
        await expect(scope.gateway.invoke(invocation())).rejects.toMatchObject({ code: "invalid_provider_response" });
        const command = harness(
            await gatewayRoute({ behavior: { effect: "command", execution: "sync", idempotency: "keyed" } }),
        );
        await expect(command.gateway.invoke(invocation())).rejects.toMatchObject({ code: "unsupported_behavior" });
        expect(command.sent).toHaveLength(0);
    });

    test("returns only declared provider errors", async () => {
        const scope = harness(await gatewayRoute());
        scope.setResponse({ status: 404, contentType: "application/json", errorCode: "NOT_FOUND" });
        await expect(scope.gateway.invoke(invocation())).resolves.toMatchObject({
            kind: "declared-error",
            status: 404,
            errorCode: "NOT_FOUND",
        });
        scope.setResponse({ status: 404, contentType: "application/json", errorCode: "PRIVATE" });
        await expect(scope.gateway.invoke(invocation())).rejects.toMatchObject({ code: "invalid_provider_response" });
    });

    test("keeps provider, system, and conformance origins closed", async () => {
        const scope = harness(await gatewayRoute());
        for (const origin of ["provider", "system", "conformance"] as const) {
            await expect(scope.gateway.invoke({ ...invocation(), origin })).rejects.toMatchObject({
                code: "unsupported_behavior",
            });
        }
        expect(scope.sent).toHaveLength(0);
    });

    test("passes the trusted origin to grants and checks the route after transport", async () => {
        const route = await gatewayRoute();
        let current = true;
        const seen: string[] = [];
        const gateway = new CapabilityGateway({
            routes: { resolve: async () => route, isCurrent: async () => current },
            transport: {
                send: async () => {
                    current = false;
                    return { status: 200, contentType: "application/json", output: { items: ["one"] } };
                },
            },
            authorize: async (_actor, _capability, _route, origin) => {
                seen.push(origin);
                return true;
            },
            now: () => NOW,
        });
        await expect(gateway.invoke({ ...invocation(), origin: "control" })).rejects.toMatchObject({
            code: "stale_route",
        });
        expect(seen).toEqual(["control"]);
    });
});
