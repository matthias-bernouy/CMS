import { describe, expect, test } from "bun:test";
import { ControlProviderClient } from "../../src/runtime/gateway/ControlProviderClient";
import { InstallationsProviderTransport } from "../../src/runtime/gateway/InstallationsProviderTransport";

describe("Installations Provider control capabilities", () => {
    test("uses declared contract bindings and returns only validated outputs", async () => {
        const requests: Array<{ url: string; init?: RequestInit }> = [];
        const responses = [
            { route: '{"selection":{"siteId":"default"}}' },
            { providerSubjectId: "provider-user-a" },
            { accepted: true },
            { token: "short-lived-invocation-token", instanceId: "instance:account-a" },
        ];
        const control = client(requests, () => Response.json(responses.shift()));

        expect(await control.getGatewayRoute("catalog.items")).toContain("selection");
        expect(await control.resolveGatewayIdentity("catalog", "cms-user-a")).toBe("provider-user-a");
        await control.appendGatewayAudit({
            id: "audit-a",
            requestId: crypto.randomUUID(),
            occurredAt: new Date().toISOString(),
            siteId: "default",
            installationId: "installation-a",
            contractId: "catalog.items",
            capabilityId: "items.create",
            actorKind: "administrator",
            actorSubjectId: "cms-user-a",
            stage: "started",
        });
        expect(
            await control.issueGatewayInvocation({
                requestId: crypto.randomUUID(),
                installationId: "installation-a",
                contractId: "catalog.items",
                contractVersion: "1.0.0",
                capabilityId: "items.list",
            }),
        ).toEqual({ token: "short-lived-invocation-token", instanceId: "instance:account-a" });

        expect(requests.map(({ url, init }) => `${init?.method} ${new URL(url).pathname}`)).toEqual([
            "QUERY /gateway/route",
            "POST /gateway/identity",
            "POST /gateway/audit",
            "POST /gateway/invocations",
        ]);
        for (const request of requests) {
            const headers = new Headers(request.init?.headers);
            expect(headers.get("authorization")).toBe("Bearer installations-provider-token");
            expect(headers.get("x-ulvia-contract-id")).toBe("ulvia.cms.installations");
            expect(headers.get("x-ulvia-contract-version")).toBe("1.0.0");
            expect(headers.get("x-ulvia-request-id")).toMatch(/^[0-9a-f-]{36}$/);
        }
        expect(new Headers(requests[3]?.init?.headers).get("x-ulvia-capability-id")).toBe("gateway.invocation.issue");
    });

    test("maps an absent route to null and rejects malformed broker responses", async () => {
        const missing = client([], () => new Response(null, { status: 404 }));
        expect(await missing.getGatewayRoute("missing.contract")).toBeNull();

        const malformed = client([], () => Response.json({ token: "short-lived-invocation-token" }));
        await expect(
            malformed.issueGatewayInvocation({
                requestId: crypto.randomUUID(),
                installationId: "installation-a",
                contractId: "catalog.items",
                contractVersion: "1.0.0",
                capabilityId: "items.list",
            }),
        ).rejects.toThrow("invalid instanceId");
    });
});

function client(requests: Array<{ url: string; init?: RequestInit }>, respond: () => Response): ControlProviderClient {
    const transport = new InstallationsProviderTransport(
        "http://installations-provider:5103",
        "installations-provider-token",
        (async (url, init) => {
            requests.push({ url: url.toString(), init });
            return respond();
        }) as typeof fetch,
    );
    return new ControlProviderClient(transport);
}
