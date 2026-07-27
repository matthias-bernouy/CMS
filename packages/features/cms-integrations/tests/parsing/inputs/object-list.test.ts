import { describe, expect, test } from "bun:test";
import {
    parseIntegrationDefinition,
    parseIntegrationImportDto,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";

const definition: IntegrationDefinition = {
    kind: "legal-config",
    label: "Legal configuration",
    inputs: [
        {
            name: "documents",
            label: "Documents",
            type: "object-list",
            minItems: 1,
            maxItems: 3,
            fields: [
                { name: "page", label: "Page", type: "page-link", required: true },
                { name: "label", label: "Label", type: "text", required: true },
                { name: "summary", label: "Summary", type: "textarea" },
                {
                    name: "contexts",
                    label: "Contexts",
                    type: "select",
                    multiple: true,
                    required: true,
                    options: [
                        { label: "Checkout", value: "checkout" },
                        { label: "Offer", value: "offer" },
                    ],
                },
                { name: "required", label: "Required", type: "boolean" },
            ],
        },
    ],
};

describe("@bernouy/cms-integrations object-list inputs", () => {
    test("parses nested fields and validates their answer values", () => {
        const parsed = parseIntegrationDefinition(definition);
        const dto = parseIntegrationImportDto(
            {
                kind: definition.kind,
                answers: {
                    documents: [
                        {
                            page: " /terms ",
                            label: " Terms ",
                            summary: " Read first ",
                            contexts: ["checkout", "offer"],
                            required: "true",
                            ignored: "not persisted",
                        },
                    ],
                },
            },
            [parsed],
        );

        expect(dto.answers.documents).toEqual([
            {
                page: "/terms",
                label: "Terms",
                summary: "Read first",
                contexts: ["checkout", "offer"],
                required: true,
            },
        ]);
    });

    test("rejects malformed definitions and invalid nested selections", () => {
        expect(() =>
            parseIntegrationDefinition({
                kind: "bad-list",
                label: "Bad list",
                inputs: [{ name: "items", label: "Items", type: "object-list", fields: [] }],
            }),
        ).toThrow(/at least one field/);

        expect(() =>
            parseIntegrationImportDto(
                {
                    kind: definition.kind,
                    answers: {
                        documents: [{ page: "/terms", label: "Terms", contexts: ["unknown"], required: false }],
                    },
                },
                [definition],
            ),
        ).toThrow(/must be one of the declared options/);
    });
});
