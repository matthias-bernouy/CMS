import { afterEach, expect, test } from "bun:test";
import { Toast, ToastStack } from "@bernouy/components";
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
    document.head.innerHTML = '<meta name="basePath" content="/cms">';
    const access = new UserAdmin();
    access.setAttribute("sub", "local:member");
    access.setAttribute("enabled", "false");
    access.setAttribute("editable", "true");
    document.body.append(access);
    let updated = false;
    document.addEventListener("user:updated", () => (updated = true), { once: true });

    access.querySelector<HTMLElement>("p9r-button")!.click();
    await waitFor(() => updated);

    expect(request).toEqual({
        url: "/cms/api/users/admin",
        body: { sub: "local:member", enabled: true },
    });
    expect(access.getAttribute("enabled")).toBe("true");
    expect(access.textContent).toContain("Remove admin");
});

test("protected administrator access has no mutation control", () => {
    const access = new UserAdmin();
    access.setAttribute("sub", "local:bootstrap");
    access.setAttribute("enabled", "true");
    access.setAttribute("editable", "false");
    document.body.append(access);

    expect(access.textContent).toBe("Administrator");
    expect(access.querySelector("p9r-button")).toBeNull();
});

async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 50 && !condition(); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
