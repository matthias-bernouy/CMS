import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../harness";
import { rootCategoryRow, useCategoryResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce category detail baseline budgets", () => {
    test("records three ordered database reads for administrator detail with a parent", async () => {
        useCategoryResponder();

        const response = await requestCommerce("/admin/category?id=9", { userRole: null });
        const calls = capturedFetches();

        expect(response.status).toBe(200);
        expect(calls.map(call => resource(call.url))).toEqual([
            "categories",
            "categories",
            "category_custom_fields",
        ]);
        expect(calls.map(call => call.method)).toEqual(["GET", "GET", "GET"]);
        expect(new URL(calls[0]!.url).searchParams.get("select")).toBe(categorySelect);
        expect(new URL(calls[1]!.url).searchParams.get("select")).toBe(parentSelect);
        const fields = new URL(calls[2]!.url).searchParams;
        expect(fields.get("category_id")).toBe("eq.9");
        expect(fields.get("select")).toBe(categoryFieldSelect);
        expect(fields.get("order")).toBe("position.asc,field_key.asc");
    });

    test("records two database reads for public detail with a parent", async () => {
        useCategoryResponder();

        const response = await requestCommerce("/category?fullSlug=%20sports%2Ftennis%20");
        const calls = capturedFetches();

        expect(response.status).toBe(200);
        expect(calls.map(call => resource(call.url))).toEqual(["categories", "categories"]);
        const selector = new URL(calls[0]!.url).searchParams;
        expect(selector.get("full_slug")).toBe("eq.sports/tennis");
        expect(selector.get("id")).toBeNull();
    });

    test("skips only the parent read for root categories", async () => {
        useCategoryResponder({ category: rootCategoryRow(), parent: null, fields: [] });

        const admin = await requestCommerce("/admin/category?id=3");
        const adminCalls = capturedFetches();

        expect(admin.status).toBe(200);
        expect(adminCalls.map(call => resource(call.url))).toEqual(["categories", "category_custom_fields"]);

        useCategoryResponder({ category: rootCategoryRow(), parent: null, fields: [] });
        const publicResponse = await requestCommerce("/category?id=3");
        const publicCalls = capturedFetches().slice(adminCalls.length);

        expect(publicResponse.status).toBe(200);
        expect(publicCalls.map(call => resource(call.url))).toEqual(["categories"]);
    });

    test("uses the secret service-role transport for every baseline read", async () => {
        useCategoryResponder();

        await requestCommerce("/admin/category?id=9");

        expect(capturedFetches().every(call => call.headers.get("apikey") === "sb_secret_test"))
            .toBeTrue();
        expect(capturedFetches().every(call => call.headers.get("authorization") === null))
            .toBeTrue();
        expect(capturedFetches().every(call => call.headers.get("accept-profile") === "commerce"))
            .toBeTrue();
        expect(capturedFetches().every(call => call.headers.get("content-profile") === null))
            .toBeTrue();
    });
});

function resource(url: string): string | undefined {
    return new URL(url).pathname.split("/").at(-1);
}

const categorySelect = "id,parent_id,slug,full_slug,label,description,status,position,metadata,version,created_at,updated_at";
const parentSelect = "id,slug,full_slug,label,status";
const categoryFieldSelect = "category_id,field_key,required,filterable,position,definition:custom_field_definitions(label,field_type,options,unit,public_readable,enabled)";
