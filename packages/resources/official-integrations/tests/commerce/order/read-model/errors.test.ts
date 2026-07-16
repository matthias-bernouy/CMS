import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import { orderRows } from "./fixtures/raw";
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
        const invalidId = await requestCommerce("/me/order?id=nope", { userId: "actor" });
        expect({ status: invalidId.status, body: await invalidId.json() }).toEqual({
            status: 400, body: { error: "id must be an integer" },
        });
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
        setRestResponder(request => new URL(request.url).pathname.endsWith("/orders")
            ? jsonResponse([orderRows[0]])
            : jsonResponse({ error: "detail lookup must not run" }, 500));

        const response = await requestCommerce("/me/order?id=42", { userId: "other-buyer" });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "order not found" });
        expect(capturedFetches()).toHaveLength(1);
    });

    test("does not disclose a seller order to another seller", async () => {
        setRestResponder(request => {
            const resource = new URL(request.url).pathname.split("/").at(-1);
            if (resource === "sellers") return jsonResponse([{ id: 99 }]);
            if (resource === "orders") return jsonResponse([]);
            return jsonResponse({ error: "detail lookup must not run" }, 500);
        });

        const response = await requestCommerce("/me/sale?id=42", { userId: "other-seller" });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "sale not found" });
        expect(capturedFetches()).toHaveLength(2);
    });

    test("returns the administrator 404 after one missing-order lookup", async () => {
        setRestResponder(() => jsonResponse([]));

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
