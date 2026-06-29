import type { IntegrationDefinition } from "../interfaces/Integration";

export const STRIPE_INTEGRATION: IntegrationDefinition = {
    kind: "stripe",
    label: "Stripe",
    version: "1",
    category: "Payments",
    description: "Import a minimal Stripe source from static API templates.",
    inputs: [
        { name: "id", label: "Source id", type: "text", required: true, defaultValue: "stripe" },
        { name: "apiKey", label: "Secret key", type: "password", required: true, secret: true },
    ],
    ui: {
        mark: "S",
        markClass: "stripe",
        emit: "source:updated",
        instructions: [
            ["Open Stripe developers", "Create or select a restricted API key."],
            ["Limit permissions", "Grant only the resources imported by this setup."],
            ["Name the source", "Keep the source id stable because bindings can reference it."],
        ],
        scopes: ["Customers read", "Secret storage", "Source contract write"],
        checks: [
            "The template creates outbound Authorization headers from the secret reference.",
            "The secret key is stored in the CMS secrets backend.",
            "You can re-run the integration later with a forced import if needed.",
        ],
        resources: [
            ["Sources", "Stripe customers source contract"],
            ["Secrets", "Stripe secret key reference"],
            ["Templates", "Default source contract template"],
        ],
        review: [
            "Generated sources stay inspectable in Sources.",
            "Secret references are resolved server-side only.",
            "Source contracts are imported through the integration pipeline.",
        ],
        sync: ["Validate answers", "Create secret reference", "Install source template", "Refresh Sources"],
        syncNote: "The first sync installs the source template and links it to the stored API key.",
    },
    secrets: [
        { input: "apiKey", key: "STRIPE_{{env answers.id}}_API_KEY" },
    ],
    artifacts: [
        {
            type: "source",
            source: {
                id: "{{answers.id}}",
                meta: { name: "Stripe", icon: "credit-card" },
                endpoints: [
                    {
                        endpointId: "listCustomers",
                        method: "GET",
                        targetUrl: "https://api.stripe.com/v1/customers",
                        params: [],
                        headers: [
                            {
                                name: "authorization",
                                source: { from: "secret", ref: "{{secrets.apiKey}}", prefix: "Bearer " },
                            },
                        ],
                    },
                ],
            },
        },
    ],
};
