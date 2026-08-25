import { describe, expect, spyOn, test } from "bun:test";
import { dispatchRequest } from "http-runner/core/request/dispatch";

describe("public HTTP errors", () => {
    test("serializes explicit field metadata without leaking private properties", async () => {
        const errorLog = spyOn(console, "error").mockImplementation(() => {});
        try {
            const response = await dispatchRequest(
                new Request("http://localhost/page", { method: "POST" }),
                {
                    middlewares: [],
                    handler: () => {
                        throw Object.assign(new Error("A page already uses this path."), {
                            status: 409,
                            publicCode: "page_path_taken",
                            field: "path",
                            privateDetail: "mongodb-index-name",
                        });
                    },
                },
                [],
            );
            expect(response.status).toBe(409);
            expect(await response.json()).toEqual({
                error: "A page already uses this path.",
                code: "page_path_taken",
                field: "path",
            });
        } finally {
            errorLog.mockRestore();
        }
    });
});
