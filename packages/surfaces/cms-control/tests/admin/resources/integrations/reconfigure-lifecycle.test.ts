import { afterEach, describe, expect, test } from "bun:test";
import "../../../../src/components/admin/Resources/Integrations/IntegrationBrowser";
import { openIntegrationReconfigure } from "cms-control/components/admin/Resources/Integrations/reconfigure";
import { createAdmin, detail, setValue, value } from "./support";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
    history.replaceState(null, "", "/");
});

describe("integration reconfiguration lifecycle", () => {
    test("exposes the modal title and actions without changing the shared modal primitive", () => {
        const admin = createAdmin();
        const styles = admin.querySelector<HTMLStyleElement>(":scope > style")?.textContent ?? "";

        expect(styles).toContain(".integration-reconfigure-modal::part(header)");
        expect(styles).toContain(".integration-reconfigure-modal::part(footer)");
    });

    test("scrubs field controls on Cancel and recreates them on the next open", async () => {
        globalThis.fetch = (async (_input) => Response.json(detail())) as typeof fetch;
        const admin = createAdmin();
        await openIntegrationReconfigure(admin);
        const secret = admin.query<HTMLInputElement>('[name="stripeSecretKey"]');
        setValue(admin, "stripeSecretKey", "sk_must_be_scrubbed");

        admin.query<HTMLElement>("[data-reconfigure-cancel]").click();

        expect(secret.isConnected).toBeFalse();
        expect(admin.query<HTMLElement>("[data-reconfigure-fields]").childElementCount).toBe(0);
        expect(admin.query<HTMLElement>("[data-reconfigure-modal]").hasAttribute("open")).toBeFalse();

        await openIntegrationReconfigure(admin);
        expect(admin.query<HTMLInputElement>('[name="stripeSecretKey"]')).not.toBe(secret);
        expect(value(admin, "stripeSecretKey")).toBe("");
    });

    test("scrubs field controls after a native modal close", async () => {
        globalThis.fetch = (async (_input) => Response.json(detail())) as typeof fetch;
        const admin = createAdmin();
        await openIntegrationReconfigure(admin);
        const secret = admin.query<HTMLInputElement>('[name="stripeSecretKey"]');
        setValue(admin, "stripeSecretKey", "sk_must_be_scrubbed");
        const modal = admin.query<HTMLElement>("[data-reconfigure-modal]");

        modal.removeAttribute("open");
        modal.dispatchEvent(new CustomEvent("close", { bubbles: true }));

        expect(secret.isConnected).toBeFalse();
        expect(admin.query<HTMLElement>("[data-reconfigure-fields]").childElementCount).toBe(0);
        await openIntegrationReconfigure(admin);
        expect(value(admin, "stripeSecretKey")).toBe("");
    });
});
