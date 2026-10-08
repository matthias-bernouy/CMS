import { describe, expect, test } from "bun:test";
import { compileHttpBinding } from "@bernouy/cms-repository/contracts/bindings";
import { capability, objectSchema, stringSchema } from "../support/fixtures";

describe("HTTP input binding compilation", () => {
    test("accounts for path, query, header, and body properties exactly once", () => {
        const compiled = compileHttpBinding(
            capability({
                input: objectSchema(
                    {
                        messageId: stringSchema(128),
                        locale: stringSchema(12),
                        sender: stringSchema(128),
                        payload: objectSchema({ subject: stringSchema(200) }, ["subject"]),
                    },
                    ["messageId", "payload"],
                ),
                binding: {
                    transport: "http",
                    method: "PATCH",
                    path: "/v1/messages/{messageId}",
                    input: {
                        path: { messageId: "messageId" },
                        query: { locale: "locale" },
                        headers: { "x-sender-alias": "sender" },
                        body: { properties: ["payload"] },
                    },
                    response: { successStatuses: [200], contentTypes: ["application/json"] },
                },
            }),
        );

        expect(compiled.routeKey).toBe("PATCH /v1/messages/{}");
        expect(compiled.pathParameters).toEqual([
            { encoding: "uri-component", wireName: "messageId", property: "messageId" },
        ]);
        expect(compiled.body).toEqual({
            kind: "json",
            contentTypes: ["application/json"],
            properties: ["payload"],
        });
        expect(Object.isFrozen(compiled)).toBe(true);
    });

    test("rejects unmapped and multiply mapped properties", () => {
        expect(() =>
            compileHttpBinding(
                capability({
                    binding: {
                        transport: "http",
                        method: "POST",
                        path: "/v1/messages",
                        input: { body: { properties: ["recipient"] } },
                        response: { successStatuses: [200], contentTypes: ["application/json"] },
                    },
                }),
            ),
        ).toThrow("unmapped input properties: templateId");

        expect(() =>
            compileHttpBinding(
                capability({
                    binding: {
                        transport: "http",
                        method: "POST",
                        path: "/v1/messages",
                        input: {
                            query: { recipient: "recipient" },
                            body: { properties: ["recipient", "templateId"] },
                        },
                        response: { successStatuses: [200], contentTypes: ["application/json"] },
                    },
                }),
            ),
        ).toThrow("mapped more than once");
    });

    test("reserves security and protocol headers for the gateway", () => {
        for (const header of ["authorization", "keep-alive", "x-ulvia-error-code", "x-ulvia-request-id"]) {
            expect(() =>
                compileHttpBinding(
                    capability({
                        binding: {
                            transport: "http",
                            method: "POST",
                            path: "/v1/messages",
                            input: {
                                headers: { [header]: "recipient" },
                                body: { properties: ["templateId"] },
                            },
                            response: { successStatuses: [200], contentTypes: ["application/json"] },
                        },
                    }),
                ),
            ).toThrow("gateway-owned");
        }
    });

    test("keeps credentials out of URLs except for opaque signed access tokens", () => {
        const sensitive = { ...stringSchema(512), sensitive: true as const };
        expect(() =>
            compileHttpBinding(
                capability({
                    behavior: { effect: "query", execution: "sync" },
                    input: objectSchema({ secret: sensitive }, ["secret"]),
                    binding: {
                        transport: "http",
                        method: "GET",
                        path: "/v1/private",
                        input: { query: { secret: "secret" } },
                        response: { successStatuses: [200], contentTypes: ["application/json"] },
                    },
                }),
            ),
        ).toThrow("sensitive parameters must use headers");

        const access = compileHttpBinding(
            capability({
                behavior: { effect: "query", execution: "sync" },
                input: objectSchema({ access: sensitive }, []),
                binding: {
                    transport: "http",
                    method: "GET",
                    path: "/v1/private",
                    input: { query: { access: "access" } },
                    response: { successStatuses: [200], contentTypes: ["application/json"] },
                },
            }),
        );
        expect(access.query).toEqual([{ encoding: "uri-component", wireName: "access", property: "access" }]);
    });

    test("rejects request bodies on GET and HEAD", () => {
        expect(() =>
            compileHttpBinding(
                capability({
                    behavior: { effect: "query", execution: "sync" },
                    binding: {
                        transport: "http",
                        method: "GET",
                        path: "/v1/messages",
                        input: { body: true },
                        response: { successStatuses: [200], contentTypes: ["application/json"] },
                    },
                }),
            ),
        ).toThrow("GET capabilities cannot have a body");
    });
});
