import { describe, expect, test } from "bun:test";
import { parseContractRelease } from "@bernouy/cms-contracts";
import { compareContractReleases } from "@bernouy/cms-contracts/compatibility";
import { capabilityDocument, contractDocument, objectSchema, stringSchema } from "../support/fixtures";

describe("contract release compatibility", () => {
    test("accepts an additive capability in a minor release", () => {
        const previous = parseContractRelease(contractDocument({ version: "1.0.0" }));
        const added = capabilityDocument({
            id: "email.message.get",
            behavior: { effect: "query", execution: "sync" },
            input: objectSchema({ id: stringSchema(64) }, ["id"]),
            binding: {
                transport: "http",
                method: "GET",
                path: "/v1/messages/{id}",
                input: { path: { id: "id" } },
                response: {
                    successStatuses: [200],
                    contentTypes: ["application/json"],
                    errorStatuses: { INVALID_RECIPIENT: 422 },
                },
            },
        });
        const next = parseContractRelease(
            contractDocument({ version: "1.1.0", capabilities: [capabilityDocument(), added] }),
        );

        expect(compareContractReleases(previous, next)).toMatchObject({ compatible: true, requiredBump: "minor" });
    });

    test("requires a major release when a capability schema changes", () => {
        const previous = parseContractRelease(contractDocument({ version: "1.0.0" }));
        const changed = capabilityDocument({
            input: objectSchema({ recipient: stringSchema(100), templateId: stringSchema(64) }, [
                "recipient",
                "templateId",
            ]),
        });
        const next = parseContractRelease(contractDocument({ version: "1.1.0", capabilities: [changed] }));
        const report = compareContractReleases(previous, next);

        expect(report.compatible).toBe(false);
        expect(report.requiredBump).toBe("major");
        expect(report.issues.map((issue) => issue.code)).toContain("insufficient_version_bump");
    });

    test("requires a major release when capability access changes", () => {
        const previous = parseContractRelease(contractDocument({ version: "1.0.0" }));
        const next = parseContractRelease(
            contractDocument({ version: "1.0.1", capabilities: [capabilityDocument({ access: "public" })] }),
        );

        expect(compareContractReleases(previous, next)).toMatchObject({ compatible: false, requiredBump: "major" });
    });

    test("requires a major release when command idempotency changes", () => {
        const previous = parseContractRelease(contractDocument({ version: "1.0.0" }));
        const next = parseContractRelease(
            contractDocument({
                version: "1.0.1",
                capabilities: [
                    capabilityDocument({ behavior: { effect: "command", execution: "sync", idempotency: "none" } }),
                ],
            }),
        );

        expect(compareContractReleases(previous, next)).toMatchObject({ compatible: false, requiredBump: "major" });
    });

    test("allows descriptions to change in a patch release", () => {
        const previousCapability = capabilityDocument();
        const previousInput = previousCapability.input as Record<string, unknown>;
        const previousProperties = previousInput.properties as Record<string, Record<string, unknown>>;
        previousProperties.recipient = { ...previousProperties.recipient, description: "Old documentation." };
        const previous = parseContractRelease(
            contractDocument({ version: "1.0.0", capabilities: [previousCapability] }),
        );
        const nextCapability = capabilityDocument({ description: "Updated." });
        const nextInput = nextCapability.input as Record<string, unknown>;
        const nextProperties = nextInput.properties as Record<string, Record<string, unknown>>;
        nextProperties.recipient = { ...nextProperties.recipient, description: "New documentation." };
        const next = parseContractRelease(contractDocument({ version: "1.0.1", capabilities: [nextCapability] }));

        expect(compareContractReleases(previous, next)).toMatchObject({ compatible: true, requiredBump: "patch" });
    });

    test("allows capability deprecation metadata in a patch release", () => {
        const previous = parseContractRelease(contractDocument({ version: "1.0.0" }));
        const next = parseContractRelease(
            contractDocument({
                version: "1.0.1",
                capabilities: [capabilityDocument({ deprecation: { reason: "Use a newer capability." } })],
            }),
        );

        expect(compareContractReleases(previous, next)).toMatchObject({ compatible: true, requiredBump: "patch" });
    });

    test("preserves business properties named description", () => {
        const previous = parseContractRelease(
            contractDocument({
                version: "1.0.0",
                capabilities: [
                    capabilityDocument({ input: objectSchema({ description: stringSchema(128) }, ["description"]) }),
                ],
            }),
        );
        const next = parseContractRelease(
            contractDocument({
                version: "1.0.1",
                capabilities: [
                    capabilityDocument({
                        input: objectSchema({ description: { type: "integer" } }, ["description"]),
                    }),
                ],
            }),
        );

        expect(compareContractReleases(previous, next)).toMatchObject({ compatible: false, requiredBump: "major" });
    });

    test("ignores binary request media type declaration order", () => {
        const release = (version: string, mediaTypes: readonly string[]) =>
            parseContractRelease(
                contractDocument({
                    version,
                    capabilities: [
                        capabilityDocument({
                            input: objectSchema(
                                {
                                    attachment: { type: "binary", maxBytes: 1024, mediaTypes },
                                },
                                ["attachment"],
                            ),
                            binding: {
                                transport: "http",
                                method: "POST",
                                path: "/v1/files",
                                input: { body: { binaryProperty: "attachment" } },
                            },
                        }),
                    ],
                }),
            );
        const previous = release("1.0.0", ["application/pdf", "image/png"]);
        const next = release("1.0.1", ["image/png", "application/pdf"]);

        expect(compareContractReleases(previous, next)).toMatchObject({ compatible: true, requiredBump: "patch" });
    });
});
