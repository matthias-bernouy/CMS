import { describe, expect, test } from "bun:test";
import {
    expectSingleRpc,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../harness";
import { rootCategoryRow, useCategoryResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce optimized category detail budgets", () => {
    for (const scenario of [
        {
            label: "administrator child",
            path: "/admin/category?id=9",
            scope: "admin",
            id: 9,
            fullSlug: null,
            root: false,
        },
        {
            label: "public child",
            path: "/category?fullSlug=%20sports%2Ftennis%20",
            scope: "public",
            id: null,
            fullSlug: "sports/tennis",
            root: false,
        },
        {
            label: "administrator root",
            path: "/admin/category?id=3",
            scope: "admin",
            id: 3,
            fullSlug: null,
            root: true,
        },
        {
            label: "public root",
            path: "/category?id=3",
            scope: "public",
            id: 3,
            fullSlug: null,
            root: true,
        },
    ] as const) {
        test(`loads the ${scenario.label} detail in one database call`, async () => {
            useCategoryResponder(scenario.root
                ? { category: rootCategoryRow(), parent: null, fields: [] }
                : {});

            const response = await requestCommerce(scenario.path, { userRole: null });

            expect(response.status).toBe(200);
            expect(expectSingleRpc("get_category_read_model").body).toEqual({
                p_scope: scenario.scope,
                p_category_id: scenario.id,
                p_full_slug: scenario.fullSlug,
            });
        });
    }

    test("uses the secret service-role transport for the private read model", async () => {
        useCategoryResponder();

        await requestCommerce("/admin/category?id=9", { userRole: null });
        const call = expectSingleRpc("get_category_read_model");

        expect(call.headers.get("apikey")).toBe("sb_secret_test");
        expect(call.headers.get("authorization")).toBeNull();
        expect(call.headers.get("accept-profile")).toBe("commerce");
        expect(call.headers.get("content-profile")).toBe("commerce");
    });
});
