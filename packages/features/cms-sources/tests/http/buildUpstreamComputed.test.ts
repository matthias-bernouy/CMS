import { describe, expect, test } from "bun:test";
import { buildUpstreamUrl } from "cms-sources/core/upstream/buildUpstreamUrl";
import type { SourceEndpoint } from "cms-sources/interfaces/Source";

const endpoint = (input: SourceEndpoint["input"]): SourceEndpoint => ({
    urn: "urn:x:e",
    method: "GET",
    targetUrl: "https://api.example.com/v1/items",
    input,
});
const query = (value = "") => new URL("http://local/?" + value).searchParams;

describe("buildUpstreamUrl computed params", () => {
    test("feeds a computed user id to a query param", () => {
        const result = buildUpstreamUrl(
            endpoint({
                params: [
                    {
                        name: "user_id",
                        in: "query",
                        required: true,
                        source: { from: "computed", ref: "userID" },
                        schema: { type: "string" },
                    },
                ],
            }),
            query("user_id=evil"),
            { userID: "user-123" },
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.url).toBe("https://api.example.com/v1/items?user_id=user-123");
        }
    });

    test("feeds a computed user id to a header param", () => {
        const result = buildUpstreamUrl(
            endpoint({
                params: [
                    {
                        name: "X-User-ID",
                        in: "header",
                        source: { from: "computed", ref: "userID" },
                        schema: { type: "string" },
                    },
                ],
            }),
            query(),
            { userID: "user-123" },
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.headers).toEqual({ "X-User-ID": "user-123" });
        }
    });

    test("feeds a computed role to a query param", () => {
        const result = buildUpstreamUrl(
            endpoint({
                params: [
                    {
                        name: "operator_role",
                        in: "query",
                        required: true,
                        source: { from: "computed", ref: "userRole" },
                        schema: { type: "string" },
                    },
                ],
            }),
            query("operator_role=admin"),
            { userRole: "custom" },
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.url).toBe("https://api.example.com/v1/items?operator_role=custom");
        }
    });

    test("rejects a missing required computed user id", () => {
        const result = buildUpstreamUrl(
            endpoint({
                params: [
                    {
                        name: "user_id",
                        in: "query",
                        required: true,
                        source: { from: "computed", ref: "userID" },
                        schema: { type: "string" },
                    },
                ],
            }),
            query(),
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(401);
        }
    });
});
