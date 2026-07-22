import { describe, expect, test } from "bun:test";

import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
    supabaseUrl,
} from "../../harness";

installCommerceTestEnvironment();

describe("commerce system seller identity", () => {
    test("returns only the trusted actor identity after one narrow lookup", async () => {
        setRestResponder(() =>
            jsonResponse([
                {
                    id: 184,
                    cms_user_id: "seller-subject",
                    display_name: "Private seller name",
                    verification_status: "verified",
                    verified_by: "private-operator",
                    metadata: {
                        email: "private@example.test",
                        address: "7 Private Street",
                    },
                },
            ]),
        );

        const response = await requestCommerce(
            "/system/seller/identity?cmsUserId=spoofed" + "&cms_user_id=eq.spoofed&id=999&select=*",
            { userId: "seller-subject" },
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            exists: true,
            id: 184,
            cmsUserId: "seller-subject",
        });
        expectSellerLookup("seller-subject");
    });

    test("returns the exact absent identity after one narrow lookup", async () => {
        setRestResponder(() => jsonResponse([]));

        const response = await requestCommerce("/system/seller/identity", {
            userId: "missing-seller",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ exists: false });
        expectSellerLookup("missing-seller");
    });

    test("rejects invalid callers and methods before PostgREST", async () => {
        const missingUser = await requestCommerce("/system/seller/identity");
        const wrongKey = await requestCommerce("/system/seller/identity", {
            authorization: "Bearer wrong-key",
            userId: "seller-subject",
        });
        const wrongMethod = await requestCommerce("/system/seller/identity", {
            method: "POST",
            userId: "seller-subject",
        });

        expect([
            {
                status: missingUser.status,
                body: await missingUser.json(),
            },
            {
                status: wrongKey.status,
                body: await wrongKey.json(),
            },
            {
                status: wrongMethod.status,
                body: await wrongMethod.text(),
                allow: wrongMethod.headers.get("allow"),
            },
        ]).toEqual([
            { status: 401, body: { error: "missing CMS user id" } },
            { status: 401, body: { error: "invalid CMS API key" } },
            {
                status: 405,
                body: "Method Not Allowed",
                allow: "GET, OPTIONS",
            },
        ]);
        expect(capturedFetches()).toHaveLength(0);
    });
});

function expectSellerLookup(cmsUserId: string): void {
    const calls = capturedFetches();
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    const url = new URL(call.url);
    expect(call.url.startsWith(`${supabaseUrl}/rest/v1/`)).toBe(true);
    expect(url.pathname).toBe("/rest/v1/sellers");
    expect(call.method).toBe("GET");
    expect([...url.searchParams]).toHaveLength(3);
    expect(Object.fromEntries(url.searchParams)).toEqual({
        select: "id,cms_user_id",
        limit: "1",
        cms_user_id: `eq.${cmsUserId}`,
    });
    expect(call.headers.get("apikey")).toBe("sb_secret_test");
    expect(call.headers.get("authorization")).toBeNull();
    expect(call.headers.get("accept-profile")).toBe("commerce");
    expect(call.headers.get("content-profile")).toBeNull();
    expect(call.body).toEqual({});
}
