import { expect, test } from "bun:test";
import type { LocalCredentialStore } from "@bernouy/cms-auth";
import type { CapabilityGatewayOptions } from "@bernouy/cms-gateway";
import { createProductionGatewayAccess } from "../../src/runtime/gateway/access";

test("production gateway grants only public Delivery calls and bootstrap-admin Control calls", async () => {
    const credentials = {
        getByEmail: async () => ({ sub: "bootstrap-1" }),
    } as unknown as LocalCredentialStore;
    const access = createProductionGatewayAccess(credentials, "admin@example.test");
    expect(await access.isAdministrator({ identifier: "local:bootstrap-1" })).toBe(true);
    expect(await access.isAdministrator({ identifier: "oidc:bootstrap-1" })).toBe(false);

    const publicCapability = { access: "public" } as Parameters<CapabilityGatewayOptions["authorize"]>[1];
    const privateCapability = { access: "authenticated" } as Parameters<CapabilityGatewayOptions["authorize"]>[1];
    const route = {} as Parameters<CapabilityGatewayOptions["authorize"]>[2];
    expect(await access.authorize({ kind: "anonymous" }, publicCapability, route, "delivery")).toBe(true);
    expect(await access.authorize({ kind: "user", subjectId: "user-1" }, privateCapability, route, "delivery")).toBe(
        false,
    );
    expect(
        await access.authorize(
            { kind: "administrator", subjectId: "local:bootstrap-1" },
            privateCapability,
            route,
            "control",
        ),
    ).toBe(true);
    expect(await access.authorize({ kind: "user", subjectId: "user-1" }, publicCapability, route, "control")).toBe(
        false,
    );
});
