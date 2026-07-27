import { describe, expect, test } from "bun:test";
import { collectReconfigureAnswers, renderFields } from "cms-control/components/admin/Resources/Integrations/fields";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";

const definition: IntegrationDefinition = {
    kind: "stripe-connect",
    label: "Stripe Connect",
    inputs: [
        { name: "id", label: "Identifier", type: "text", required: true },
        { name: "stripePublishableKey", label: "Publishable key", type: "text", required: true },
        { name: "stripeSecretKey", label: "Secret key", type: "password", required: true },
        { name: "apiEndpoint", label: "API endpoint", type: "url", required: true },
    ],
};

describe("integration reconfiguration fields", () => {
    test("prefills public answers, locks id, and never renders stored secrets", () => {
        const { root, template } = formFixture();

        renderFields(
            root,
            template,
            definition,
            {
                id: "stripe-connect",
                stripePublishableKey: "pk_test_public",
                stripeSecretKey: "must-not-render",
                apiEndpoint: "https://api.example.test",
            },
            { mode: "reconfigure", secretInputs: ["stripeSecretKey"] },
        );

        expect(input(root, "id").value).toBe("stripe-connect");
        expect(input(root, "id").disabled).toBeTrue();
        expect(input(root, "stripePublishableKey").value).toBe("pk_test_public");
        expect(input(root, "apiEndpoint").value).toBe("https://api.example.test");
        expect(input(root, "stripeSecretKey").value).toBe("");
        expect(input(root, "stripeSecretKey").type).toBe("password");
        expect(input(root, "stripeSecretKey").required).toBeFalse();
        expect(input(root, "stripeSecretKey").placeholder).toContain("keep the current secret");
        expect(root.textContent).not.toContain("must-not-render");
    });

    test("omits immutable and blank secret values but submits live keys together", () => {
        const { root, template } = formFixture();
        const savedAnswers = {
            id: "stripe-connect",
            stripePublishableKey: "pk_test_public",
            apiEndpoint: "https://api.example.test",
        };
        renderFields(root, template, definition, savedAnswers, {
            mode: "reconfigure",
            secretInputs: ["stripeSecretKey"],
        });

        expect(collectReconfigureAnswers(root, definition, ["stripeSecretKey"], savedAnswers)).toEqual({});

        input(root, "stripePublishableKey").value = "pk_live_public";
        input(root, "stripeSecretKey").value = "sk_live_private";
        expect(collectReconfigureAnswers(root, definition, ["stripeSecretKey"], savedAnswers)).toEqual({
            stripePublishableKey: "pk_live_public",
            stripeSecretKey: "sk_live_private",
        });
    });

    test("distinguishes stored secrets from new required and optional secrets", () => {
        const { root, template } = formFixture();
        const evolvedDefinition: IntegrationDefinition = {
            kind: "evolved-secrets",
            label: "Evolved secrets",
            inputs: [
                { name: "storedSecret", label: "Stored", type: "password", required: true, secret: true },
                { name: "newRequiredSecret", label: "New required", type: "password", required: true, secret: true },
                { name: "newOptionalSecret", label: "New optional", type: "text", secret: true },
            ],
        };

        renderFields(
            root,
            template,
            evolvedDefinition,
            {},
            {
                mode: "reconfigure",
                secretInputs: ["storedSecret"],
            },
        );

        expect(input(root, "storedSecret").required).toBeFalse();
        expect(input(root, "storedSecret").placeholder).toContain("keep the current secret");
        expect(hint(root, "storedSecret")).toContain("keep the current secret");
        expect(input(root, "newRequiredSecret").required).toBeTrue();
        expect(input(root, "newRequiredSecret").placeholder).toBe("Enter the required secret");
        expect(hint(root, "newRequiredSecret")).toContain("new secret");
        expect(input(root, "newOptionalSecret").required).toBeFalse();
        expect(input(root, "newOptionalSecret").placeholder).toBe("Enter a secret (optional)");
        expect(hint(root, "newOptionalSecret")).toContain("No secret is currently stored");
    });

    test("deeply compares JSON answers without depending on object key order", () => {
        const { root, template } = formFixture();
        const jsonDefinition: IntegrationDefinition = {
            kind: "json-config",
            label: "JSON config",
            inputs: [{ name: "settings", label: "Settings", type: "json", required: true }],
        };
        const savedAnswers = { settings: { endpoint: "/v1", retry: { count: 2, codes: [409, 503] } } };
        renderFields(root, template, jsonDefinition, savedAnswers, { mode: "reconfigure" });

        textarea(root, "settings").value = '{"retry":{"codes":[409,503],"count":2},"endpoint":"/v1"}';
        expect(collectReconfigureAnswers(root, jsonDefinition, [], savedAnswers)).toEqual({});

        textarea(root, "settings").value = '{"retry":{"codes":[409,504],"count":2},"endpoint":"/v1"}';
        expect(collectReconfigureAnswers(root, jsonDefinition, [], savedAnswers)).toEqual({
            settings: { endpoint: "/v1", retry: { count: 2, codes: [409, 504] } },
        });
    });
});

function formFixture(): { root: HTMLDivElement; template: HTMLTemplateElement } {
    const root = document.createElement("div");
    const template = document.createElement("template");
    template.innerHTML =
        '<label class="field"><span data-label></span><span data-control></span><small data-hint></small></label>';
    return { root, template };
}

function input(root: HTMLElement, name: string): HTMLInputElement {
    return root.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
}

function textarea(root: HTMLElement, name: string): HTMLTextAreaElement {
    return root.querySelector<HTMLTextAreaElement>(`[name="${name}"]`)!;
}

function hint(root: HTMLElement, name: string): string {
    return input(root, name).closest(".field")!.querySelector<HTMLElement>("[data-hint]")!.textContent ?? "";
}
