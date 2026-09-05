import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { afterEach, beforeAll, expect, test } from "bun:test";
import { CheckoutFlow } from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/commerce/checkout/checkout/Bloc.ts";

const originalFetch = globalThis.fetch;
const tag = "mossa-checkout-populated-copy-test";
beforeAll(() => customElements.define(tag, class extends CheckoutFlow {}));
afterEach(() => {
    document.body.replaceChildren();
    globalThis.fetch = originalFetch;
    location.href = "http://localhost/";
});

test("accepts a late authenticated email binding without adding a Source dependency or losing populated copy", async () => {
    const requests: string[] = [];
    location.href = "http://localhost/checkout?offerId=123";
    globalThis.fetch = (async (input) => {
        const path = String(input);
        requests.push(path);
        if (path.endsWith("getAccount")) {
            return Response.json({ givenName: "Alex", surname: "Example", postalCode: "75001" });
        }
        if (path.includes("/commerce/offer?")) {
            return Response.json({ id: 123, title: "Sample racket", acceptedPriceAmount: 9000, currency: "EUR" });
        }
        if (path.includes("entityCustomFields")) {
            return Response.json({ fields: [] });
        }
        throw new Error(`Unexpected request: ${path}`);
    }) as typeof fetch;
    const checkout = document.createElement(tag);
    checkout.setAttribute("first-name-label", "Customer first name");
    checkout.setAttribute("pending-amount-label", "Awaiting quote");
    checkout.setAttribute("relay-city-label", "Destination city");
    checkout.innerHTML = '<div slot="checkout-payment" data-checkout-payment></div>';
    document.body.append(checkout);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(Object.hasOwn(checkout.shadowRoot!.querySelector('[name="email"]')!, "value")).toBe(false);
    await registerFields();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = checkout.shadowRoot!;
    expect(root.querySelector<HTMLElement>("[data-content]")?.hidden).toBe(false);
    expect(root.querySelector<HTMLInputElement>('[name="email"]')?.value).toBe("");
    checkout.setAttribute("account-email", "alex@example.test");
    expect(root.querySelector<HTMLInputElement>('[name="email"]')?.value).toBe("alex@example.test");
    expect(root.querySelector('[name="email"]')?.hasAttribute("readonly")).toBe(true);
    expect(root.querySelector('[name="givenName"]')?.getAttribute("label")).toBe("Customer first name");
    expect(root.querySelector("[data-shipping]")?.textContent).toBe("Awaiting quote");
    expect(root.querySelector("[data-relay-picker]")?.getAttribute("city-label")).toBe("Destination city");
    checkout.removeAttribute("first-name-label");
    expect(root.querySelector('[name="givenName"]')?.getAttribute("label")).toBe("First name");
    expect(root.querySelector<HTMLInputElement>('[name="givenName"]')?.value).toBe("Alex");
    expect(root.querySelector("[data-offer-title]")?.textContent).toBe("Sample racket");
    expect(requests).toHaveLength(3);
    expect(requests.every((path) => path.includes("/user-account/") || path.includes("/commerce/"))).toBe(true);
    expect(root.querySelector('[name="email"]')?.shadowRoot?.querySelector<HTMLInputElement>("input")?.value).toBe(
        "alex@example.test",
    );
});

async function registerFields(): Promise<void> {
    for (const name of ["mossa-select", "mossa-option"]) {
        if (!customElements.get(name)) {
            customElements.define(name, class extends HTMLElement {});
        }
    }
    if (customElements.get("mossa-input")) {
        return;
    }
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
    const artifact = definition?.artifacts?.find(
        (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "mossa-input",
    );
    if (!artifact || artifact.type !== "bloc" || !artifact.bloc.viewJS) {
        throw new Error("Input source not found");
    }
    const compiled = await prepare_bloc(
        new File([artifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
        null,
        artifact.bloc.name,
        "Forms",
        "",
        "mossa-input",
        artifact.bloc.source,
    );
    new Function(compiled.viewJS)();
}
