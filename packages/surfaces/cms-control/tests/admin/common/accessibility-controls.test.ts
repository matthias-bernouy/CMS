import { afterEach, describe, expect, test } from "bun:test";
import { CredentialSelect } from "cms-control/components/admin/Common/CredentialSelect/CredentialSelect";
import { renderList } from "cms-control/components/admin/Common/CredentialSelect/controller";
import "cms-control/components/admin/Actions/ProviderActions/ProviderActions";
import "cms-control/components/admin/Common/RoleSelect/RoleSelect";
import "cms-control/components/admin/Secrets/Secrets";

const originalFetch = globalThis.fetch;
const originalConfirm = globalThis.confirm;

if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {};
}

afterEach(() => {
    document.body.replaceChildren();
    globalThis.fetch = originalFetch;
    globalThis.confirm = originalConfirm;
});

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("admin control accessibility", () => {
    test("gives provider switches a contextual name that follows their state", () => {
        const actions = document.createElement("cms-provider-actions");
        actions.setAttribute("provider-id", "github");
        actions.setAttribute("kind", "oauth");
        actions.setAttribute("enabled", "false");
        document.body.append(actions);

        const switchButton = () => actions.shadowRoot!.querySelector<HTMLButtonElement>("[role='switch']")!;
        expect({
            type: switchButton().type,
            checked: switchButton().getAttribute("aria-checked"),
            label: switchButton().getAttribute("aria-label"),
        }).toEqual({ type: "button", checked: "false", label: "Enable github provider" });

        actions.setAttribute("enabled", "true");
        expect(switchButton().getAttribute("aria-label")).toBe("Disable github provider");
    });

    test("supports named keyboard selection in the credential picker", () => {
        const control = new CredentialSelect();
        control.setAttribute("label", "API token");
        control.setAttribute("aria-label", "Select API token");
        document.body.append(control);
        control._value = "";
        control._keys = ["GITHUB_TOKEN", "STRIPE_TOKEN"];
        renderList(control, control._keys);

        const root = control.shadowRoot!;
        const label = root.querySelector<HTMLLabelElement>("label")!;
        const trigger = root.querySelector<HTMLButtonElement>(".trigger")!;
        const search = root.querySelector<HTMLInputElement>(".search")!;
        root.querySelectorAll<HTMLElement>(".option").forEach((item) => {
            item.scrollIntoView = () => {};
        });
        let change: Event | undefined;
        control.addEventListener("change", (event) => {
            change = event;
        });

        expect({
            labelFor: label.htmlFor,
            triggerId: trigger.id,
            role: trigger.getAttribute("role"),
            name: trigger.getAttribute("aria-label"),
            controls: trigger.getAttribute("aria-controls"),
            searchName: search.getAttribute("aria-label"),
        }).toEqual({
            labelFor: "credential-trigger",
            triggerId: "credential-trigger",
            role: "combobox",
            name: "Select API token",
            controls: "credential-listbox",
            searchName: "Search credentials",
        });

        search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
        expect(search.getAttribute("aria-activedescendant")).toBe("credential-option-0");
        search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        expect(control.value).toBe("${GITHUB_TOKEN}");
        expect(change?.composed).toBe(true);
        control.focus();
        expect(root.activeElement).toBe(trigger);
    });

    test("forwards names and disabled state through the role picker", async () => {
        globalThis.fetch = (async () =>
            Response.json([{ id: "admin", label: "Administrator" }])) as unknown as typeof fetch;
        const control = document.createElement("cms-role-select");
        control.setAttribute("value", "admin");
        control.setAttribute("label", "Account role");
        control.setAttribute("aria-label", "Choose account role");
        control.setAttribute("disabled", "");
        document.body.append(control);
        await nextTask();

        const select = control.shadowRoot!.querySelector("p9r-select")!;
        expect({
            label: select.getAttribute("label"),
            ariaLabel: select.getAttribute("aria-label"),
            disabled: select.hasAttribute("disabled"),
        }).toEqual({ label: "Account role", ariaLabel: "Choose account role", disabled: true });
    });

    test("configures write-only secrets in a scrubbed modal and confirms deletion", async () => {
        let requests = 0;
        globalThis.fetch = (async () => {
            requests++;
            return Response.json([{ key: "STRIPE_KEY" }]);
        }) as unknown as typeof fetch;
        const secrets = document.createElement("cms-secrets");
        document.body.append(secrets);
        await nextTask();

        const row = secrets.shadowRoot!.querySelector<HTMLElement>("[data-key='STRIPE_KEY']")!;
        const configure = row.querySelector<HTMLElement>("[data-action='configure']")!;
        const deleteButton = row.querySelector<HTMLElement>("[data-action='delete']")!;
        expect(row.querySelector("[data-role='value']")).toBeNull();
        expect(row.querySelector("[data-action='reveal']")).toBeNull();
        expect(configure.textContent?.trim()).toBe("Configure");
        expect(configure.getAttribute("aria-label")).toBe("Configure STRIPE_KEY secret");
        expect(deleteButton.textContent?.trim()).toBe("Delete");
        expect(deleteButton.getAttribute("aria-label")).toBe("Delete STRIPE_KEY secret");

        configure.click();
        const root = secrets.shadowRoot!;
        const modal = root.querySelector<HTMLElement>("[data-role='configure-modal']")!;
        const value = root.querySelector<HTMLElement & { value: string }>("[data-role='configure-value']")!;
        const cancel = root.querySelector<HTMLElement>("[data-action='configure-cancel']")!;
        const confirm = root.querySelector<HTMLElement & { disabled: boolean }>("[data-action='configure-confirm']")!;
        expect(modal.hasAttribute("open")).toBe(true);
        expect(modal.getAttribute("aria-label")).toBe("Configure STRIPE_KEY secret");
        expect(value.value).toBe("");
        expect(cancel.textContent?.trim()).toBe("Cancel");
        expect(confirm.textContent?.trim()).toBe("Confirm");
        expect(confirm.disabled).toBe(true);
        expect(requests).toBe(1);

        value.value = "replacement";
        value.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        expect(confirm.disabled).toBe(false);

        cancel.click();
        expect(modal.hasAttribute("open")).toBe(false);
        expect(value.value).toBe("");

        let confirmation = "";
        globalThis.confirm = (message) => {
            confirmation = message ?? "";
            return false;
        };
        deleteButton.click();
        await nextTask();
        expect(confirmation).toContain('Delete secret "STRIPE_KEY"?');
        expect(requests).toBe(1);
    });
});
