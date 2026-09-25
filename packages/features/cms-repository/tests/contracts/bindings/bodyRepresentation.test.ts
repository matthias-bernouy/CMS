import { describe, expect, test } from "bun:test";
import { compileHttpBinding } from "@bernouy/cms-repository/contracts/bindings";
import { capability, objectSchema } from "../support/fixtures";

describe("HTTP body representation", () => {
    test("emits an explicit JSON representation", () => {
        const compiled = compileHttpBinding(capability());

        expect(compiled.body).toMatchObject({ kind: "json", contentTypes: ["application/json"] });
    });

    test("rejects binary values until a request encoding is defined", () => {
        expect(() =>
            compileHttpBinding(
                capability({
                    input: objectSchema(
                        {
                            attachment: {
                                type: "binary",
                                maxBytes: 1024,
                                mediaTypes: ["application/pdf"],
                            },
                        },
                        ["attachment"],
                    ),
                }),
            ),
        ).toThrow("explicit transport encoding");
    });

    test("compiles one required binary property as the request body", () => {
        const compiled = compileHttpBinding(
            capability({
                input: objectSchema(
                    {
                        attachment: {
                            type: "binary",
                            maxBytes: 1024,
                            mediaTypes: ["application/pdf"],
                        },
                    },
                    ["attachment"],
                ),
                binding: {
                    transport: "http",
                    method: "POST",
                    path: "/v1/files",
                    input: { body: { binaryProperty: "attachment" } },
                    response: {
                        successStatuses: [200],
                        contentTypes: ["application/json"],
                        errorStatuses: { INVALID_RECIPIENT: 422 },
                    },
                },
            }),
        );

        expect(compiled.body).toEqual({
            kind: "binary",
            contentTypes: ["application/pdf"],
            property: "attachment",
        });
    });
});
