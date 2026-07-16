import { describe, expect, test } from "bun:test";
import { InMemoryRolesRepository, PUBLIC_ROLE, USER_ROLE } from "@bernouy/cms-permissions";
import type { SourceEndpoint } from "@bernouy/cms-sources";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { authorizeDeliverySourceEndpoint } from "cms-delivery/core/sources/authorization";

describe("authorizeDeliverySourceEndpoint", () => {
    test("ignores stale grants above the caller access mode", async () => {
        const roles = new InMemoryRolesRepository();
        await roles.upsert({
            id: PUBLIC_ROLE,
            label: "Public",
            builtin: true,
            grants: [{ permission: "urn:shop:adminProducts" }],
        });

        const result = await authorizeDeliverySourceEndpoint(
            cmsWithRoles(roles),
            endpoint("adminProducts", "admin"),
            new Request("http://site/.cms/sources/shop/adminProducts"),
        );

        expect(result).toEqual({ authorized: false, status: 401 });
    });

    test("allows grants within the caller access mode", async () => {
        const roles = new InMemoryRolesRepository();
        await roles.upsert({
            id: USER_ROLE,
            label: "User",
            builtin: true,
            grants: [{ permission: "urn:shop:myOrders" }],
        });

        const result = await authorizeDeliverySourceEndpoint(
            cmsWithRoles(roles),
            endpoint("myOrders", "auth"),
            new Request("http://site/.cms/sources/shop/myOrders"),
            { subject: { identifier: "user-1", role: USER_ROLE } as never },
        );

        expect(result).toBe(true);
    });

    test("enforces explicit endpoint roles without grants or an admin bypass", async () => {
        const roles = new InMemoryRolesRepository();
        const restricted = {
            ...endpoint("refund", "admin"),
            access: { mode: "admin" as const, roles: ["finance"] },
        };

        const finance = await authorizeDeliverySourceEndpoint(
            cmsWithRoles(roles),
            restricted,
            new Request("http://site/.cms/sources/shop/refund"),
            { subject: { identifier: "finance-1", role: "finance" } as never },
        );
        const admin = await authorizeDeliverySourceEndpoint(
            cmsWithRoles(roles),
            restricted,
            new Request("http://site/.cms/sources/shop/refund"),
            { subject: { identifier: "admin-1", role: "admin" } as never },
        );

        expect(finance).toBe(true);
        expect(admin).toEqual({ authorized: false, status: 403 });
    });
});

function cmsWithRoles(roles: InMemoryRolesRepository): DeliveryCms {
    return { roles } as unknown as DeliveryCms;
}

function endpoint(id: string, mode: SourceEndpoint["access"]["mode"]): SourceEndpoint {
    return {
        urn: `urn:shop:${id}`,
        method: "GET",
        access: { mode },
        targetUrl: `https://example.com/${id}`,
    };
}
