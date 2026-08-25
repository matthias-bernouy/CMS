import { afterEach, describe, expect, test } from "bun:test";
import { P9rSelect } from "../../../src/ui/Form/Selection/P9rSelect/P9rSelect";

const tag = "p9r-select-accessibility";
if (!customElements.get(tag)) {
    customElements.define(tag, P9rSelect);
}

if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {};
}

afterEach(() => document.body.replaceChildren());

function option(value: string, label: string, attributes: Record<string, string> = {}): HTMLOptionElement {
    const item = document.createElement("option");
    item.value = value;
    item.textContent = label;
    for (const [name, attributeValue] of Object.entries(attributes)) {
        item.setAttribute(name, attributeValue);
    }
    return item;
}

function mount(attributes: Record<string, string> = {}): P9rSelect {
    const control = document.createElement(tag) as P9rSelect;
    for (const [name, value] of Object.entries(attributes)) {
        control.setAttribute(name, value);
    }
    control.append(
        option("", "Choose one", { selected: "" }),
        option("alpha", "Alpha"),
        option("beta", "Beta", { disabled: "" }),
        option("gamma", "Gamma"),
    );
    document.body.append(control);
    return control;
}

function press(element: HTMLElement, key: string): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event;
}

describe("P9rSelect", () => {
    test("exposes custom combobox, listbox, label, and option semantics", () => {
        const control = mount({ label: "Category", required: "", hint: "Choose a category" });
        const root = control.shadowRoot!;
        const label = root.querySelector<HTMLLabelElement>("label")!;
        const trigger = root.querySelector<HTMLButtonElement>(".trigger")!;
        const options = Array.from(root.querySelectorAll<HTMLElement>("[role='option']"));

        expect({ labelFor: label.htmlFor, triggerId: trigger.id, role: trigger.getAttribute("role") }).toEqual({
            labelFor: "trigger",
            triggerId: "trigger",
            role: "combobox",
        });
        expect({
            controls: trigger.getAttribute("aria-controls"),
            expanded: trigger.getAttribute("aria-expanded"),
            required: trigger.getAttribute("aria-required"),
            describedBy: trigger.getAttribute("aria-describedby"),
            listRole: root.querySelector("#listbox")?.getAttribute("role"),
        }).toEqual({
            controls: "listbox",
            expanded: "false",
            required: "true",
            describedBy: "hint",
            listRole: "listbox",
        });
        expect(options.map((item) => item.getAttribute("aria-disabled"))).toEqual(["false", "false", "true", "false"]);
        expect(options.map((item) => item.getAttribute("aria-selected"))).toEqual(["true", "false", "false", "false"]);
    });

    test("selects by keyboard, skips disabled options, and emits one composed change", () => {
        const control = mount({ "aria-label": "Category" });
        const trigger = control.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!;
        const changes: Event[] = [];
        document.addEventListener("change", (event) => changes.push(event), { once: true });

        control.focus();
        expect(control.shadowRoot!.activeElement).toBe(trigger);
        expect(press(trigger, "ArrowDown").defaultPrevented).toBe(true);
        expect(trigger.getAttribute("aria-activedescendant")).toBe("option-1");
        press(trigger, "ArrowDown");
        expect(trigger.getAttribute("aria-activedescendant")).toBe("option-3");
        expect(press(trigger, "Enter").defaultPrevented).toBe(true);

        expect(control.value).toBe("gamma");
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        expect(changes).toHaveLength(1);
        expect(changes[0]!.composed).toBe(true);
    });

    test("announces required errors and restores its initial form value", () => {
        const control = mount({ value: "alpha", required: "" });
        const root = control.shadowRoot!;
        const trigger = root.querySelector<HTMLButtonElement>(".trigger")!;
        const hint = root.querySelector<HTMLElement>("#hint")!;

        control.value = "";
        control.dispatchEvent(new Event("invalid"));
        expect({ invalid: trigger.getAttribute("aria-invalid"), hint: hint.textContent, hidden: hint.hidden }).toEqual({
            invalid: "true",
            hint: "Please select a value.",
            hidden: false,
        });

        control.value = "gamma";
        control.formResetCallback();
        expect(control.value).toBe("alpha");
        control.formStateRestoreCallback("gamma");
        expect(control.value).toBe("gamma");
        expect(trigger.hasAttribute("aria-invalid")).toBe(false);
    });
});
