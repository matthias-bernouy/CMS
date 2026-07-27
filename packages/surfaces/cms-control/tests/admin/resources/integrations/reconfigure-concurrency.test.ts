import { afterEach, expect, test } from "bun:test";
import "../../../../src/components/admin/Resources/Integrations/IntegrationBrowser";
import {
    closeIntegrationReconfigure,
    openIntegrationReconfigure,
} from "cms-control/components/admin/Resources/Integrations/reconfigure";
import { createAdmin, detail, flush, setValue, value } from "./support";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
    history.replaceState(null, "", "/");
});

test("an earlier rerun does not close a newly reopened reconfigure dialog", async () => {
    let finishRerun!: (response: Response) => void;
    let rerunStarted!: () => void;
    const started = new Promise<void>((resolve) => (rerunStarted = resolve));
    globalThis.fetch = (async (input) => {
        if (!String(input).includes("/rerun")) {
            return Response.json(detail());
        }
        rerunStarted();
        return new Promise<Response>((resolve) => (finishRerun = resolve));
    }) as typeof fetch;
    const admin = createAdmin();
    await openIntegrationReconfigure(admin);
    setValue(admin, "stripeSecretKey", "sk_live_private");
    admin.query<HTMLFormElement>("[data-reconfigure-form]").requestSubmit();
    await started;

    closeIntegrationReconfigure(admin);
    await openIntegrationReconfigure(admin);
    finishRerun(Response.json({}));
    await flush();

    expect(admin.query<HTMLElement>("[data-reconfigure-modal]").hasAttribute("open")).toBeTrue();
    expect(value(admin, "stripeSecretKey")).toBe("");
});

test("pending submit ignores duplicates and retains one request through a native close", async () => {
    let finishRerun!: (response: Response) => void;
    let rerunStarted!: () => void;
    const started = new Promise<void>((resolve) => (rerunStarted = resolve));
    const requests: string[] = [];
    globalThis.fetch = (async (input) => {
        const url = String(input);
        requests.push(url);
        if (!url.includes("/rerun")) {
            return Response.json(detail());
        }
        rerunStarted();
        return new Promise<Response>((resolve) => (finishRerun = resolve));
    }) as typeof fetch;
    const admin = createAdmin();
    let reconfigured = 0;
    document.addEventListener("integration:reconfigured", () => reconfigured++, { once: true });
    await openIntegrationReconfigure(admin);
    setValue(admin, "stripeSecretKey", "sk_live_private");
    const form = admin.query<HTMLFormElement>("[data-reconfigure-form]");
    form.requestSubmit();
    await started;
    const modal = admin.query<HTMLElement>("[data-reconfigure-modal]");

    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(requests.filter((url) => url.includes("/rerun"))).toHaveLength(1);

    modal.removeAttribute("open");
    modal.dispatchEvent(new CustomEvent("close", { bubbles: true }));

    expect(modal.hasAttribute("open")).toBeTrue();
    expect(value(admin, "stripeSecretKey")).toBe("sk_live_private");
    expect(requests.filter((url) => url.includes("/rerun"))).toHaveLength(1);

    finishRerun(Response.json({}));
    await flush();

    expect(reconfigured).toBe(1);
    expect(requests.filter((url) => url.includes("/rerun"))).toHaveLength(1);
    expect(requests.filter((url) => !url.includes("/rerun"))).toHaveLength(1);
    expect(modal.hasAttribute("open")).toBeFalse();
    expect(admin.query<HTMLElement>("[data-reconfigure-fields]").childElementCount).toBe(0);
});
