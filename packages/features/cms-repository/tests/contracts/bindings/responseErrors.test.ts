import { describe, expect, test } from "bun:test";
import { compileHttpBinding } from "@bernouy/cms-repository/contracts/bindings";
import { capability } from "../support/fixtures";

describe("HTTP error response binding compilation", () => {
    test("requires one valid HTTP status for every declared error", () => {
        expect(() =>
            compileHttpBinding(
                capability({
                    bindings: [
                        {
                            id: "http",
                            transport: "http",
                            method: "POST",
                            path: "/v1/messages",
                            input: { body: true },
                            response: {
                                successStatuses: [200],
                                contentTypes: ["application/json"],
                                errorStatuses: {},
                            },
                        },
                    ],
                }),
            ),
        ).toThrow("must exactly match declared errors");
        expect(() =>
            compileHttpBinding(
                capability({
                    bindings: [
                        {
                            id: "http",
                            transport: "http",
                            method: "POST",
                            path: "/v1/messages",
                            input: { body: true },
                            response: {
                                successStatuses: [200],
                                contentTypes: ["application/json"],
                                errorStatuses: { INVALID_RECIPIENT: 200 },
                            },
                        },
                    ],
                }),
            ),
        ).toThrow("must be 4xx or 5xx");
    });
});
