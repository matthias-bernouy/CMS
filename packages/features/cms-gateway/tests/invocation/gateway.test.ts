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
import { InMemoryGatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";
import { gatewayRoute, NOW } from "../fixtures";

function harness(route: GatewayRoute, identities = new ProviderIdentityAliases(new InMemoryIdentityService())) {
    const sent: GatewayTransportRequest[] = [];
    let current = true;
    let response: GatewayTransportResponse = {
        status: 200,
        contentType: "application/json",
        output: { items: ["one"] },
    };
    const commandAudit = new InMemoryGatewayCommandAuditStore();
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
        commandAudit,
        now: () => NOW,
    });
    return {
        gateway,
        commandAudit,
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

    test("propagates an opaque subject alias for administrator capabilities", async () => {
        const scope = harness(await gatewayRoute({ access: "admin" }));
        await scope.gateway.invoke(invocation({ kind: "administrator", subjectId: "cms-admin-1" }));

        const alias = scope.sent[0]?.providerSubjectId;
        expect(alias).toMatch(/^[0-9a-f-]{36}$/);
        expect(JSON.stringify(scope.sent[0])).not.toContain("cms-admin-1");
        expect(await scope.identities.resolve({ providerId: "ulvia.example" }, alias!)).toBe("cms-admin-1");
    });

    test("checks access without invoking the provider or creating an identity alias", async () => {
        const identities = new InMemoryIdentityService();
        const scope = harness(await gatewayRoute({ access: "authenticated" }), new ProviderIdentityAliases(identities));
        const call = invocation({ kind: "user", subjectId: "cms-user-1" });
        await scope.gateway.assertAuthorized(call);
        expect(scope.sent).toHaveLength(0);
        expect(
            await identities.resolve({ authority: "cms", kind: "user", value: "cms-user-1" }, "ulvia.example"),
        ).toBeNull();
        await expect(scope.gateway.assertAuthorized(invocation())).rejects.toMatchObject({ code: "not_authorized" });
    });

    test("returns provider binary output as a neutral stream", async () => {
        const scope = harness(await gatewayRoute({ binary: true }));
        scope.setResponse({ status: 200, contentType: "image/png", bytes: new Uint8Array([1, 2, 3]) });
        const result = await scope.gateway.invoke(invocation(undefined, { fileId: "photo-1" }));
        expect(result.kind).toBe("binary");
        if (result.kind === "binary") {
            expect(new Uint8Array(await new Response(result.stream).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
        }
    });

    test("executes synchronous commands without a keyed retry contract", async () => {
        for (const idempotency of ["natural", "none"] as const) {
            const scope = harness(
                await gatewayRoute({ behavior: { effect: "command", execution: "sync", idempotency } }),
            );
            await expect(scope.gateway.invoke(invocation())).resolves.toMatchObject({
                kind: "success",
                output: { items: ["one"] },
            });
            expect(scope.sent).toHaveLength(1);
            expect(scope.sent[0]?.binding.method).toBe("POST");
            expect(scope.commandAudit.list().map((event) => event.stage)).toEqual(["started", "completed"]);
        }
    });

    test("fails closed before dispatch when command audit is unavailable", async () => {
        const route = await gatewayRoute({
            behavior: { effect: "command", execution: "sync", idempotency: "natural" },
        });
        let sent = 0;
        const gateway = new CapabilityGateway({
            routes: { resolve: async () => route, isCurrent: async () => true },
            transport: {
                send: async () => {
                    sent += 1;
                    return { status: 200, contentType: "application/json", output: { items: ["saved"] } };
                },
            },
            authorize: async () => true,
            now: () => NOW,
        });

        await expect(gateway.invoke(invocation())).rejects.toMatchObject({ code: "transport_failure" });
        expect(sent).toBe(0);
    });

    test("marks a dispatched command outcome unknown when its route changes or response fails", async () => {
        const route = await gatewayRoute({ behavior: { effect: "command", execution: "sync", idempotency: "none" } });
        let current = true;
        let sent = 0;
        const gateway = new CapabilityGateway({
            routes: { resolve: async () => route, isCurrent: async () => current },
            transport: {
                send: async () => {
                    sent += 1;
                    current = false;
                    return { status: 200, contentType: "application/json", output: { items: ["saved"] } };
                },
            },
            authorize: async () => true,
            commandAudit: new InMemoryGatewayCommandAuditStore(),
            now: () => NOW,
        });
        await expect(gateway.invoke(invocation())).rejects.toMatchObject({
            code: "outcome_unknown",
            requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        });
        expect(sent).toBe(1);

        current = true;
        const failing = new CapabilityGateway({
            routes: { resolve: async () => route, isCurrent: async () => true },
            transport: {
                send: async () => {
                    throw new TypeError("connection lost");
                },
            },
            authorize: async () => true,
            commandAudit: new InMemoryGatewayCommandAuditStore(),
            now: () => NOW,
        });
        await expect(failing.invoke(invocation())).rejects.toMatchObject({ code: "outcome_unknown" });

        const malformed = new CapabilityGateway({
            routes: { resolve: async () => route, isCurrent: async () => true },
            transport: {
                send: async () => ({ status: 200, contentType: "application/json", output: { items: [42] } }),
            },
            authorize: async () => true,
            commandAudit: new InMemoryGatewayCommandAuditStore(),
            now: () => NOW,
        });
        await expect(malformed.invoke(invocation())).rejects.toMatchObject({ code: "outcome_unknown" });
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
        await expect(command.gateway.invoke(invocation())).rejects.toMatchObject({ code: "invalid_input" });
        expect(command.sent).toHaveLength(0);
    });

    test("forwards keyed operations and validates their protocol handle", async () => {
        const scope = harness(
            await gatewayRoute({ behavior: { effect: "command", execution: "operation", idempotency: "keyed" } }),
        );
        scope.setResponse({
            status: 202,
            contentType: "application/json",
            output: { operationId: "00000000-0000-4000-8000-000000000010" },
        });

        await expect(scope.gateway.invoke({ ...invocation(), idempotencyKey: "migration-1" })).resolves.toMatchObject({
            kind: "success",
            status: 202,
            output: { operationId: "00000000-0000-4000-8000-000000000010" },
        });
        expect(scope.sent[0]).toMatchObject({ idempotencyKey: "migration-1" });

        scope.setResponse({ status: 202, contentType: "application/json", output: { operationId: "bad" } });
        await expect(scope.gateway.invoke({ ...invocation(), idempotencyKey: "migration-2" })).rejects.toMatchObject({
            code: "outcome_unknown",
        });
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

    test("accepts only trusted actor kinds for provider and system origins", async () => {
        const scope = harness(await gatewayRoute());
        await expect(scope.gateway.invoke({ ...invocation(), origin: "provider" })).rejects.toMatchObject({
            code: "not_authorized",
        });
        await expect(
            scope.gateway.invoke({
                ...invocation({ kind: "provider", installationId: "caller-installation" }),
                origin: "provider",
            }),
        ).resolves.toMatchObject({ kind: "success" });
        await expect(
            scope.gateway.invoke({ ...invocation({ kind: "system", serviceId: "scheduler" }), origin: "system" }),
        ).resolves.toMatchObject({ kind: "success" });
        await expect(
            scope.gateway.invoke({
                ...invocation({ kind: "system", serviceId: "conformance" }),
                origin: "conformance",
            }),
        ).resolves.toMatchObject({ kind: "success" });
    });

    test("propagates provider call chains and rejects cycles before transport", async () => {
        const scope = harness(await gatewayRoute());
        const actor = { kind: "provider" as const, installationId: "caller-installation" };
        await scope.gateway.invoke({
            ...invocation(actor),
            origin: "provider",
            callContext: {
                callChainId: "00000000-0000-4000-8000-000000000001",
                callDepth: 0,
                installationPath: ["caller-installation"],
            },
        });
        expect(scope.sent[0]?.callContext).toEqual({
            callChainId: "00000000-0000-4000-8000-000000000001",
            callDepth: 1,
            installationPath: ["caller-installation", "install-a"],
        });

        await expect(
            scope.gateway.invoke({
                ...invocation(actor),
                origin: "provider",
                callContext: {
                    callChainId: "00000000-0000-4000-8000-000000000001",
                    callDepth: 1,
                    installationPath: ["install-a", "caller-installation"],
                },
            }),
        ).rejects.toMatchObject({ code: "not_authorized" });
        expect(scope.sent).toHaveLength(1);
    });

    test("requires an exact execution pin for Page calls", async () => {
        const route = await gatewayRoute();
        const scope = harness(route);
        await expect(scope.gateway.invoke({ ...invocation(), origin: "page" })).rejects.toMatchObject({
            code: "not_authorized",
        });
        await expect(
            scope.gateway.invoke({
                ...invocation(),
                origin: "page",
                execution: {
                    planDigest: `sha256:${"a".repeat(64)}`,
                    version: route.selection.version,
                    digest: route.selection.digest,
                    installationId: route.selection.installationId,
                },
            }),
        ).resolves.toMatchObject({ kind: "success" });
        await expect(
            scope.gateway.invoke({
                ...invocation(),
                origin: "page",
                execution: {
                    planDigest: `sha256:${"a".repeat(64)}`,
                    version: route.selection.version,
                    digest: route.selection.digest,
                    installationId: "install-other",
                },
            }),
        ).rejects.toMatchObject({ code: "stale_route" });
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
