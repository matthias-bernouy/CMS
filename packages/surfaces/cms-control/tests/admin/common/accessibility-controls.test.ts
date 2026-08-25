import { afterEach, describe, expect, test } from "bun:test";
import { CredentialSelect } from "cms-control/components/admin/Common/CredentialSelect/CredentialSelect";
import { renderList } from "cms-control/components/admin/Common/CredentialSelect/controller";
import "cms-control/components/admin/Actions/ProviderActions/ProviderActions";
import "cms-control/components/admin/Common/RoleSelect/RoleSelect";
import "cms-control/components/admin/Secrets/Secrets";

const originalFetch = globalThis.fetch;

if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {};
}

afterEach(() => {
    document.body.replaceChildren();
    globalThis.fetch = originalFetch;
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

    test("names secret values and icon-only actions with their secret key", async () => {
        globalThis.fetch = (async () =>
            Response.json([{ key: "STRIPE_KEY", value: "secret" }])) as unknown as typeof fetch;
        const secrets = document.createElement("cms-secrets");
        document.body.append(secrets);
        await nextTask();

        const row = secrets.shadowRoot!.querySelector<HTMLElement>("[data-key='STRIPE_KEY']")!;
        expect(row.querySelector("[data-role='value']")?.getAttribute("aria-label")).toBe("Value for STRIPE_KEY");
        expect(
            ["reveal", "save", "delete"].map((action) =>
                row.querySelector(`[data-action='${action}']`)?.getAttribute("aria-label"),
            ),
        ).toEqual(["reveal STRIPE_KEY secret", "save STRIPE_KEY secret", "delete STRIPE_KEY secret"]);
    });
});
