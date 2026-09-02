import { describe, expect, test } from "bun:test";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";
import { sandboxAnswers } from "../../src/release/sandbox/answers";
import { integrationDefinition } from "../fixtures";

describe("release sandbox answers", () => {
    test("synthesizes required non-secret and secret answers", () => {
        const definition = parseIntegrationDefinition(
            integrationDefinition("demo", "1.0.0", {
                inputs: [
                    { name: "id", label: "Id", type: "text", required: true, defaultValue: "demo" },
                    { name: "account", label: "Account", type: "text", required: true },
                    { name: "apiSecret", label: "Secret", type: "password", required: true, secret: true },
                    {
                        name: "stripeSecretKey",
                        label: "Stripe secret",
                        type: "password",
                        required: true,
                        secret: true,
                    },
                    { name: "termsHash", label: "Hash", type: "text", required: true },
                    {
                        name: "region",
                        label: "Region",
                        type: "select",
                        required: true,
                        options: [{ label: "France", value: "fr" }],
                    },
                    { name: "optional", label: "Optional", type: "text" },
                ],
            }),
        );

        expect(sandboxAnswers(definition)).toEqual({
            account: "ulvia-audit-account",
            apiSecret: "ulvia-audit-apiSecret-secret",
            stripeSecretKey: "sk_test_ulvia_audit",
            termsHash: "a".repeat(64),
            region: "fr",
        });
        expect(
            sandboxAnswers(
                parseIntegrationDefinition(
                    integrationDefinition("consent", "1.0.0", {
                        inputs: [{ name: "enabled", label: "Enabled", type: "boolean", defaultValue: true }],
                    }),
                ),
            ),
        ).toEqual({ enabled: false });
    });
});
