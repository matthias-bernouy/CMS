import { describe, expect, test } from "bun:test";
import { PUBLIC_ROLE, USER_ROLE } from "@bernouy/cms-permissions";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import {
    assertGatewayGrantsWithinAccess,
    roleCanBeGrantedEndpoint,
} from "cms-control/core/roles/gatewayAccess";

describe("gatewayAccess", () => {
    const adminEndpoint = {
        urn: "urn:orders:updateStatus",
        method: "POST" as const,
        access: { mode: "admin" as const },
        targetUrl: "https://api.example.com/status",
    };

    test("rejects grants above the role source access level", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource({
            urn: "urn:orders",
            endpoints: [adminEndpoint],
        });

        await expect(assertGatewayGrantsWithinAccess(sources, USER_ROLE, [
            { permission: adminEndpoint.urn },
        ])).rejects.toThrow("cannot be granted");
    });

    test("matches endpoint access with built-in role access levels", () => {
        expect(roleCanBeGrantedEndpoint(PUBLIC_ROLE, adminEndpoint)).toBe(false);
        expect(roleCanBeGrantedEndpoint(USER_ROLE, adminEndpoint)).toBe(false);
        expect(roleCanBeGrantedEndpoint("custom-admin", adminEndpoint)).toBe(true);
    });
});
