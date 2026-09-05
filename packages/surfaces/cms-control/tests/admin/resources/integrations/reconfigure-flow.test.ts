import { afterEach, describe, expect, test } from "bun:test";
import "../../../../src/components/admin/Resources/Integrations/IntegrationBrowser";
import { openIntegrationReconfigure } from "cms-control/components/admin/Resources/Integrations/reconfigure";
import type { IntegrationDefinition } from "cms-control/components/admin/Resources/Integrations/model";
import { createAdmin, definition, detail, flush, setValue, value } from "./support";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
    document.head.innerHTML = "";
    history.replaceState(null, "", "/");
});

describe("integration reconfiguration flow", () => {
    test("loads safe values and submits public and secret Stripe keys in one rerun", async () => {
        const requests: Array<{ url: string; body?: unknown }> = [];
        globalThis.fetch = (async (input, init) => {
            const url = String(input);
            requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
            return url.includes("/rerun") ? Response.json({}) : Response.json(detail());
        }) as typeof fetch;
        const admin = createAdmin();
        let reconfigured = 0;
        let refreshed = 0;
        document.addEventListener("integration:reconfigured", () => reconfigured++, { once: true });
        document.addEventListener("integration:updated", () => refreshed++, { once: true });

        await openIntegrationReconfigure(admin);
        const modal = admin.query<HTMLElement>("[data-reconfigure-modal]");
        expect(modal.hasAttribute("open")).toBeTrue();
        expect(value(admin, "stripePublishableKey")).toBe("pk_test_public");
        expect(value(admin, "stripeSecretKey")).toBe("");

        setValue(admin, "stripePublishableKey", "pk_live_public");
        setValue(admin, "stripeSecretKey", "sk_live_private");
        admin.query<HTMLFormElement>("[data-reconfigure-form]").requestSubmit();
        await flush();

        expect(requests.at(-1)).toEqual({
            url: "/api/integrations/installations/rerun?id=stripe-connect",
            body: {
                answers: {
                    stripePublishableKey: "pk_live_public",
                    stripeSecretKey: "sk_live_private",
                },
            },
        });
        expect(modal.hasAttribute("open")).toBeFalse();
        expect(admin.query<HTMLElement>("[data-reconfigure-fields]").childElementCount).toBe(0);
        expect(reconfigured).toBe(1);
        expect(refreshed).toBe(1);
    });

    test("uses the current catalogue definition when the stored snapshot is older", async () => {
        const evolvedDefinition = {
            ...definition,
            inputs: [
                ...definition.inputs,
                { name: "accountRegion", label: "Account region", type: "text" as const, required: true },
                {
                    name: "webhookSecret",
                    label: "Webhook secret",
                    type: "password" as const,
                    required: true,
                    secret: true,
                },
            ],
        };
        const requests: string[] = [];
        globalThis.fetch = (async (input) => {
            requests.push(String(input));
            return Response.json(detail());
        }) as typeof fetch;
        const admin = createAdmin(evolvedDefinition);

        await openIntegrationReconfigure(admin);

        const newInput = admin.query<HTMLInputElement>('[name="accountRegion"]');
        expect(newInput.required).toBeTrue();
        expect(newInput.value).toBe("");
        const newSecret = admin.query<HTMLInputElement>('[name="webhookSecret"]');
        expect(newSecret.required).toBeTrue();
        expect(newSecret.placeholder).toBe("Enter the required secret");
        expect(admin.query<HTMLElement>("[data-reconfigure-status]").textContent).toContain("newly required secret");

        setValue(admin, "accountRegion", "eu");
        admin.query<HTMLFormElement>("[data-reconfigure-form]").requestSubmit();
        await flush();
        expect(requests.filter((url) => url.includes("/rerun"))).toHaveLength(0);
    });

    test("keeps the dialog open and exposes rerun errors in its live status", async () => {
        globalThis.fetch = (async (input) =>
            String(input).includes("/rerun")
                ? new Response("Stripe rejected the credentials", { status: 500 })
                : Response.json(detail())) as typeof fetch;
        const admin = createAdmin();
        await openIntegrationReconfigure(admin);

        setValue(admin, "stripeSecretKey", "sk_live_invalid");
        admin.query<HTMLFormElement>("[data-reconfigure-form]").requestSubmit();
        await flush();

        expect(admin.query<HTMLElement>("[data-reconfigure-modal]").hasAttribute("open")).toBeTrue();
        const status = admin.query<HTMLElement>("[data-reconfigure-status]");
        expect(status.textContent).toBe("Stripe rejected the credentials");
        expect(status.classList.contains("is-error")).toBeTrue();
        expect(admin.query<HTMLElement>("[data-reconfigure-submit]").hasAttribute("aria-busy")).toBeFalse();
    });

    test("reports invalid JSON in the dialog without issuing a rerun", async () => {
        const jsonDefinition = {
            ...definition,
            inputs: [
                ...definition.inputs,
                { name: "metadata", label: "Metadata", type: "json" as const, required: true },
            ],
        };
        const requests: string[] = [];
        globalThis.fetch = (async (input) => {
            requests.push(String(input));
            return Response.json(
                detail({
                    answers: {
                        id: "stripe-connect",
                        stripePublishableKey: "pk_test_public",
                        metadata: { retries: 2 },
                    },
                }),
            );
        }) as typeof fetch;
        const admin = createAdmin(jsonDefinition);
        await openIntegrationReconfigure(admin);

        setValue(admin, "metadata", "{invalid JSON");
        admin.query<HTMLFormElement>("[data-reconfigure-form]").requestSubmit();
        await flush();

        expect(requests.filter((url) => url.includes("/rerun"))).toHaveLength(0);
        expect(admin.query<HTMLElement>("[data-reconfigure-modal]").hasAttribute("open")).toBeTrue();
        const status = admin.query<HTMLElement>("[data-reconfigure-status]");
        expect(status.textContent?.toLowerCase()).toContain("json");
        expect(status.classList.contains("is-error")).toBeTrue();
    });

    test("reconfigures exact collection resources and hides internal controllers", async () => {
        const collection = collectionDefinition();
        const requests: Array<{ url: string; body?: unknown }> = [];
        globalThis.fetch = (async (input, init) => {
            const url = String(input);
            requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
            return url.includes("/rerun")
                ? Response.json({})
                : Response.json({
                      ...detail({ definition: collection }),
                      activeResources: ["stripe-connect/blocs/card"],
                  });
        }) as typeof fetch;
        const admin = createAdmin(collection);

        await openIntegrationReconfigure(admin);
        const choices = admin.query<HTMLElement>("[data-reconfigure-resources]");
        expect(choices.hidden).toBeFalse();
        expect(choices.querySelectorAll("[data-collection-resource]")).toHaveLength(2);
        expect(choices.textContent).not.toContain("Internal controller");

        choices.querySelector<HTMLInputElement>('[data-collection-resource="stripe-connect/blocs/list"]')!.click();
        admin.query<HTMLFormElement>("[data-reconfigure-form]").requestSubmit();
        await flush();

        expect(requests.at(-1)).toEqual({
            url: "/api/integrations/installations/rerun?id=stripe-connect",
            body: {
                answers: {},
                resources: ["stripe-connect/blocs/card", "stripe-connect/blocs/list"],
            },
        });
    });
});

function collectionDefinition(): IntegrationDefinition {
    return {
        schema: "cms.integration.definition.v2",
        type: "collection",
        kind: "stripe-connect",
        label: "Collection",
        version: "1.0.0",
        inputs: [],
        resourceCategories: [{ id: "content", label: "Content" }],
        resources: [
            {
                id: "stripe-connect/blocs/card",
                type: "bloc",
                artifact: "stripe-connect-card",
                category: "content",
            },
            {
                id: "stripe-connect/blocs/list",
                type: "bloc",
                artifact: "stripe-connect-list",
                category: "content",
            },
            {
                id: "stripe-connect/blocs/internal-controller",
                type: "bloc",
                artifact: "stripe-connect-internal-controller",
                category: "content",
            },
        ],
        artifacts: [
            {
                type: "bloc",
                bloc: { tag: "stripe-connect-card", name: "Card", compositionHTML: "<article></article>" },
            },
            {
                type: "bloc",
                bloc: { tag: "stripe-connect-list", name: "List", compositionHTML: "<section></section>" },
            },
            {
                type: "bloc",
                bloc: {
                    tag: "stripe-connect-internal-controller",
                    name: "Internal controller",
                    internal: true,
                    viewJS: "customElements.define('stripe-connect-internal-controller', class extends HTMLElement {})",
                },
            },
        ],
    };
}
