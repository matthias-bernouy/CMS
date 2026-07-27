import { describe, expect, test } from "bun:test";
import { parseIntegrationDefinition, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { assertDefinitionUsable } from "cms-integrations/core/parsing/definition/definition";

describe("secret integration input definitions", () => {
    test("accepts only text-valued secret controls", () => {
        const definition = parseIntegrationDefinition({
            kind: "string-secrets",
            label: "String secrets",
            inputs: [
                { name: "username", label: "Username", type: "text", secret: true },
                { name: "endpoint", label: "Endpoint", type: "url", secret: true },
                { name: "password", label: "Password", type: "password", secret: true },
            ],
        });

        expect(definition.inputs.map((input) => input.type)).toEqual(["text", "url", "password"]);
        expect(() => assertDefinitionUsable(definition)).not.toThrow();
    });

    test("rejects non-string secret controls while parsing", () => {
        for (const input of unsupportedSecretInputs()) {
            expect(() =>
                parseIntegrationDefinition({
                    kind: `bad-${input.type}`,
                    label: "Bad secret",
                    inputs: [input],
                }),
            ).toThrow(/secret inputs must use text, url, or password/);
        }
    });

    test("rejects already-typed site definitions with non-string secrets", () => {
        for (const input of unsupportedSecretInputs()) {
            const definition = {
                kind: `bad-${input.type}`,
                label: "Bad secret",
                inputs: [input],
            } as unknown as IntegrationDefinition;

            expect(() => assertDefinitionUsable(definition)).toThrow(/secret inputs must use text, url, or password/);
        }
    });
});

function unsupportedSecretInputs(): Array<Record<string, unknown>> {
    return [
        {
            name: "plan",
            label: "Plan",
            type: "select",
            options: [{ label: "Pro", value: "pro" }],
            secret: true,
        },
        { name: "enabled", label: "Enabled", type: "boolean", secret: true },
        { name: "metadata", label: "Metadata", type: "json", secret: true },
        {
            name: "records",
            label: "Records",
            type: "object-list",
            fields: [{ name: "value", label: "Value", type: "text" }],
            secret: true,
        },
    ];
}
