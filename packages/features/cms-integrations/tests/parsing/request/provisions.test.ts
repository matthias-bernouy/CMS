import { describe, expect, test } from "bun:test";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";

describe("integration provision parsing", () => {
    test("preserves JSON configuration and declared secret outputs", () => {
        const definition = parseIntegrationDefinition({
            kind: "provisioned",
            label: "Provisioned",
            inputs: [],
            provisions: [
                {
                    provider: "stripe-webhooks",
                    configuration: {
                        secretKey: "{{connectorSecrets.apiKey}}",
                        destinations: [{ name: "platform", connect: false }],
                    },
                    outputs: [{ name: "platform", key: "PLATFORM_WEBHOOK_SECRET" }],
                },
            ],
        });

        expect(definition.provisions).toEqual([
            {
                provider: "stripe-webhooks",
                configuration: {
                    secretKey: "{{connectorSecrets.apiKey}}",
                    destinations: [{ name: "platform", connect: false }],
                },
                outputs: [{ name: "platform", key: "PLATFORM_WEBHOOK_SECRET" }],
            },
        ]);
    });

    test("rejects duplicate output names", () => {
        expect(() =>
            parseIntegrationDefinition({
                kind: "provisioned",
                label: "Provisioned",
                inputs: [],
                provisions: [
                    {
                        provider: "example",
                        configuration: {},
                        outputs: [
                            { name: "secret", key: "FIRST" },
                            { name: "secret", key: "SECOND" },
                        ],
                    },
                ],
            }),
        ).toThrow(/duplicate name "secret"/);
    });
});
