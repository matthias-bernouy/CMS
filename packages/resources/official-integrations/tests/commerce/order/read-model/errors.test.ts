import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import { useCompleteOrderResponder } from "./fixtures/responder";

installCommerceTestEnvironment();

const listRoutes = ["/me/orders", "/me/sales", "/admin/orders"];
const detailRoutes = ["/me/order", "/me/sale", "/admin/order"];

describe("commerce order and sale read failures", () => {
    test("returns the exact API-key 401 on every list and detail before PostgREST", async () => {
        for (const path of [...listRoutes, ...detailRoutes.map(route => `${route}?id=42`)]) {
            const response = await requestCommerce(path, {
                authorization: "Bearer invalid-commerce-key",
                userId: "actor",
            });
            expect({ path, status: response.status, body: await response.json() }).toEqual({
                path, status: 401, body: { error: "invalid CMS API key" },
            });
        }
        expect(capturedFetches()).toHaveLength(0);
    });

    test("returns exact 400 validation messages before PostgREST", async () => {
        for (const path of listRoutes) {
            const response = await requestCommerce(`${path}?limit=invalid`, { userId: "actor" });
            expect({ path, status: response.status, body: await response.json() }).toEqual({
                path, status: 400, body: { error: "limit must be an integer" },
            });
        }
        for (const path of detailRoutes) {
            const response = await requestCommerce(path, { userId: "actor" });
            expect({ path, status: response.status, body: await response.json() }).toEqual({
                path, status: 400, body: { error: "id or publicId is required" },
            });
        }
        const invalidId = await requestCommerce(
            "/me/order?id=nope&publicId=00000000-0000-4000-8000-000000000042",
            { userId: "actor" },
        );
        expect({ status: invalidId.status, body: await invalidId.json() }).toEqual({
            status: 400, body: { error: "id must be an integer" },
        });
        expect(capturedFetches()).toHaveLength(0);
    });

    test("preserves buyer identity timing after the initial order lookup", async () => {
        let existing = true;
        setRestResponder(() => jsonResponse({
            state: existing ? "identity_required" : "not_found",
        }));
        const found = await requestCommerce("/me/order?id=42");
        expect({ status: found.status, body: await found.json() }).toEqual({
            status: 401, body: { error: "missing CMS user id" },
        });
        expect(capturedFetches()).toHaveLength(1);
        existing = false;
        const missing = await requestCommerce("/me/order?id=404");
        expect({ status: missing.status, body: await missing.json() }).toEqual({
            status: 404, body: { error: "order not found" },
        });
        expect(capturedFetches()).toHaveLength(2);
    });

    test("preserves invalid public-id errors after seller resolution", async () => {
        let sellerExists = false;
        setRestResponder(() => sellerExists
            ? jsonResponse({ message: "invalid input syntax for type uuid: invalid" }, 400)
            : jsonResponse({ state: "not_found" }));
        const hidden = await requestCommerce("/me/sale?publicId=invalid", { userId: "seller" });
        expect({ status: hidden.status, body: await hidden.json() }).toEqual({
            status: 404, body: { error: "sale not found" },
        });
        sellerExists = true;
        const invalid = await requestCommerce("/me/sale?publicId=invalid", { userId: "seller" });
        expect({ status: invalid.status, body: await invalid.json() }).toEqual({
            status: 422, body: { error: "invalid input syntax for type uuid: invalid" },
        });
    });

    test("preserves initial and hydration failure mappings", async () => {
        setRestResponder(() => jsonResponse({ message: "orders unavailable" }, 503));
        const initial = await requestCommerce("/admin/order?id=42");
        expect({ status: initial.status, body: await initial.json() }).toEqual({
            status: 502, body: { error: "orders unavailable" },
        });

        setRestResponder(() => jsonResponse({ message: "lines unavailable" }, 503));
        const hydration = await requestCommerce("/admin/order?id=42");
        expect({ status: hydration.status, body: await hydration.json() }).toEqual({
            status: 502, body: { error: "lines unavailable" },
        });
    });

    test("keeps unsupported methods local and advertises the same methods", async () => {
        const cases = [
            ["/me/orders", "GET, POST, OPTIONS"],
            ["/me/order", "GET, OPTIONS"],
            ["/me/sales", "GET, OPTIONS"],
            ["/me/sale", "GET, OPTIONS"],
            ["/admin/orders", "GET, OPTIONS"],
            ["/admin/order", "GET, OPTIONS"],
        ] as const;
        for (const [path, allow] of cases) {
            const response = await requestCommerce(path, { method: "PUT", userId: "actor" });
            expect({ path, status: response.status, body: await response.text(), allow: response.headers.get("allow") })
                .toEqual({ path, status: 405, body: "Method Not Allowed", allow });
        }
        expect(capturedFetches()).toHaveLength(0);
    });

    test("requires a CMS user identity on buyer and seller list reads", async () => {
        for (const path of ["/me/orders", "/me/sales", "/me/sale?id=42"]) {
            const response = await requestCommerce(path);
            expect({ path, status: response.status, body: await response.json() }).toEqual({
                path, status: 401, body: { error: "missing CMS user id" },
            });
        }
        expect(capturedFetches()).toHaveLength(0);
    });

    test("does not disclose a buyer order to another buyer", async () => {
        setRestResponder(() => jsonResponse({ state: "not_found" }));

        const response = await requestCommerce("/me/order?id=42", { userId: "other-buyer" });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "order not found" });
        expect(capturedFetches()).toHaveLength(1);
    });

    test("does not disclose a seller order to another seller", async () => {
        setRestResponder(() => jsonResponse({ state: "not_found" }));

        const response = await requestCommerce("/me/sale?id=42", { userId: "other-seller" });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "sale not found" });
        expect(capturedFetches()).toHaveLength(1);
    });

    test("returns the administrator 404 after one missing-order lookup", async () => {
        setRestResponder(() => jsonResponse({ state: "not_found" }));

        const response = await requestCommerce("/admin/order?id=404");

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "order not found" });
        expect(capturedFetches()).toHaveLength(1);
    });

    test("keeps the current CMS-key-only administrator read boundary explicit", async () => {
        useCompleteOrderResponder();

        const list = await requestCommerce("/admin/orders?limit=2&offset=2", { userRole: null });
        const detail = await requestCommerce("/admin/order?id=42", { userRole: null });

        expect({ list: list.status, detail: detail.status }).toEqual({ list: 200, detail: 200 });
    });
});
