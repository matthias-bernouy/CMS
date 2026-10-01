import { afterEach, expect, test } from "bun:test";
import { Toast, ToastStack } from "@bernouy/components";
import { CmsUserActions } from "cms-control/components/admin/Actions/UserActions/UserActions";
import { UserAdmin } from "cms-control/components/admin/Actions/UserAdmin/UserAdmin";

const realFetch = globalThis.fetch;
if (!customElements.get("p9r-toast")) {
    customElements.define("p9r-toast", Toast);
}
if (!customElements.get("p9r-toast-stack")) {
    customElements.define("p9r-toast-stack", ToastStack);
}

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

test("administrator access updates without reloading the page", async () => {
    let request: { url: string; body: unknown } | undefined;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        request = { url: String(input), body: JSON.parse(String(init?.body)) };
        return Response.json({ administrator: true });
    }) as typeof fetch;
    const actions = new CmsUserActions();
    actions.setAttribute("base-path", "/cms");
    actions.setAttribute("sub", "local:member");
    actions.setAttribute("administrator", "false");
    actions.setAttribute("administrator-editable", "true");
    document.body.append(actions);
    let updated = false;
    document.addEventListener("user:updated", () => (updated = true), { once: true });

    actions.shadowRoot?.querySelector<HTMLElement>('[data-action="administrator"]')?.click();
    await waitFor(() => updated);

    expect(request).toEqual({
        url: "/cms/api/users/admin",
        body: { sub: "local:member", enabled: true },
    });
    expect(actions.getAttribute("administrator")).toBe("true");
    expect(actions.shadowRoot?.querySelector('[data-action="administrator"]')?.textContent).toBe("Remove admin");
});

test("the access cell only displays the current role", () => {
    const access = new UserAdmin();
    access.setAttribute("enabled", "true");
    document.body.append(access);

    expect(access.textContent).toBe("Administrator");
    expect(access.querySelector("p9r-button")).toBeNull();
});

test("protected administrator access stays disabled in the actions menu", async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
        requests++;
        return Response.json({ administrator: false });
    }) as unknown as typeof fetch;
    const actions = new CmsUserActions();
    actions.setAttribute("base-path", "/cms");
    actions.setAttribute("sub", "local:bootstrap");
    actions.setAttribute("administrator", "true");
    actions.setAttribute("administrator-editable", "false");
    document.body.append(actions);
    const item = actions.shadowRoot?.querySelector<HTMLElement>('[data-action="administrator"]');

    item?.click();
    await Promise.resolve();

    expect(item?.hasAttribute("disabled")).toBe(true);
    expect(item?.textContent).toBe("Remove admin");
    expect(requests).toBe(0);
});

async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 50 && !condition(); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
