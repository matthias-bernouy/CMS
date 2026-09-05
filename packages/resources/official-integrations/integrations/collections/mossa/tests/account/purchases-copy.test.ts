import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { PurchaseList } from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/account/orders/purchases/Bloc.ts";

const tag = "mossa-purchases-copy-test";
const originalFetch = globalThis.fetch;

beforeAll(() => {
    customElements.define(tag, PurchaseList);
});

afterEach(() => {
    document.body.replaceChildren();
    globalThis.fetch = originalFetch;
});

describe("Purchase state copy", () => {
    test("uses authored login copy and restores defaults without refetching", async () => {
        let requests = 0;
        globalThis.fetch = (async () => {
            requests++;
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }) as typeof fetch;
        const list = document.createElement(tag);
        list.setAttribute("login-title", "Your purchase history requires a session");
        list.setAttribute("login-description", "Continue from your account");
        document.body.append(list);
        await new Promise((resolve) => setTimeout(resolve, 0));

        const login = list.shadowRoot?.querySelector<HTMLElement>("[data-login]");
        expect(login?.hidden).toBe(false);
        expect(login?.querySelector("[slot=title]")?.textContent).toBe("Your purchase history requires a session");
        expect(login?.querySelector("[slot=description]")?.textContent).toBe("Continue from your account");
        list.removeAttribute("login-title");
        expect(login?.querySelector("[slot=title]")?.textContent).toBe("Sign in to view your purchases");
        expect(requests).toBe(1);
    });

    test("keeps configured error text when loading fails", async () => {
        globalThis.fetch = (async () => Response.json({ error: "Provider details" }, { status: 503 })) as typeof fetch;
        const list = document.createElement(tag);
        list.setAttribute("error-title", "History temporarily unavailable");
        list.setAttribute("error-message", "Please return later");
        document.body.append(list);
        await new Promise((resolve) => setTimeout(resolve, 0));

        const error = list.shadowRoot?.querySelector<HTMLElement>("[data-error]");
        expect(error?.hidden).toBe(false);
        expect(error?.querySelector("[slot=title]")?.textContent).toBe("History temporarily unavailable");
        expect(error?.querySelector("[data-error-message]")?.textContent).toBe("Please return later");
        expect(error?.textContent).not.toContain("Provider details");
    });

    test("supports empty and accessible loading state labels", async () => {
        globalThis.fetch = (async () => Response.json({ items: [], total: 0 })) as typeof fetch;
        const list = document.createElement(tag);
        list.setAttribute("empty-title", "Nothing purchased");
        list.setAttribute("empty-description", "Choose your first item");
        list.setAttribute("loading-label", "Loading purchase history");
        list.setAttribute("pagination-label", "Browse purchase pages");
        document.body.append(list);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(list.shadowRoot?.querySelector<HTMLElement>("[data-empty]")?.hidden).toBe(false);
        expect(list.shadowRoot?.querySelector("[data-empty] [slot=title]")?.textContent).toBe("Nothing purchased");
        expect(list.shadowRoot?.querySelector("[data-loading] mossa-skeleton")?.getAttribute("label")).toBe(
            "Loading purchase history",
        );
        expect(list.shadowRoot?.querySelector("[data-pagination]")?.getAttribute("aria-label")).toBe(
            "Browse purchase pages",
        );
    });
});
