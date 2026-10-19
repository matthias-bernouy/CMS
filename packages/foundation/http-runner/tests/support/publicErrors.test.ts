import { describe, expect, spyOn, test } from "bun:test";
import { PublicHttpError } from "@bernouy/http-runner";
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
                        throw Object.assign(
                            new PublicHttpError(409, "A page already uses this path.", {
                                code: "page_path_taken",
                                field: "path",
                            }),
                            {
                                privateDetail: "mongodb-index-name",
                            },
                        );
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

    test("keeps unmarked internal messages private while retaining their status", async () => {
        for (const status of [409, 503]) {
            const response = await dispatchRequest(
                new Request("http://localhost/private"),
                {
                    middlewares: [],
                    handler: () => {
                        throw Object.assign(new Error("mongodb.internal:27017 rejected the operation"), { status });
                    },
                },
                [],
            );

            expect(response.status).toBe(status);
            expect(await response.text()).not.toContain("mongodb.internal");
        }
    });
});
