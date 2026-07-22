import { afterEach, describe, expect, test } from "bun:test";
import { Combobox } from "../../src/ui/Form/Selection/Combobox/Combobox";

const tag = "p9r-combobox-behavior";
if (!customElements.get(tag)) {
    customElements.define(tag, Combobox);
}

afterEach(() => document.body.replaceChildren());

type MountOptions = { value?: string; placeholder?: string; disabled?: boolean; creatable?: boolean };

function addOption(control: Combobox, value: string, label: string): void {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    control.append(option);
}

function mountCombobox(options: MountOptions = {}): Combobox {
    const control = document.createElement(tag) as Combobox;
    addOption(control, "alpha", "Alpha");
    addOption(control, "beta", "Beta");
    if (options.value !== undefined) {
        control.setAttribute("value", options.value);
    }
    if (options.placeholder !== undefined) {
        control.setAttribute("placeholder", options.placeholder);
    }
    control.toggleAttribute("disabled", options.disabled ?? false);
    control.toggleAttribute("creatable", options.creatable ?? false);
    document.body.append(control);
    return control;
}

function shadowElement<T extends Element>(control: Combobox, selector: string): T {
    return control.shadowRoot!.querySelector<T>(selector)!;
}

function write(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

function press(input: HTMLInputElement, key: string): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    return event;
}

describe("Combobox", () => {
    test("reflects the current input text in clear-button visibility", () => {
        const control = mountCombobox({ value: "alpha" });
        const input = shadowElement<HTMLInputElement>(control, "input");
        const clearButton = shadowElement<HTMLButtonElement>(control, "[data-clear]");
        expect(clearButton.hidden).toBe(false);
        write(input, "");
        expect(clearButton.hidden).toBe(true);
        write(input, "   ");
        expect(clearButton.hidden).toBe(false);
        write(input, "Al");
        expect(clearButton.hidden).toBe(false);
    });

    test("syncs attributes, properties, focus, and late options", () => {
        const control = mountCombobox({ value: "alpha", placeholder: "Pick one", disabled: true });
        const input = shadowElement<HTMLInputElement>(control, "input");
        const label = shadowElement<HTMLElement>(control, ".label");
        expect({ value: control.value, inputValue: input.value, placeholder: input.placeholder }).toEqual({
            value: "alpha",
            inputValue: "Alpha",
            placeholder: "Pick one",
        });
        expect(input.disabled).toBe(true);
        control.disabled = false;
        control.setAttribute("label", "Choice");
        expect({ disabled: control.disabled, inputDisabled: input.disabled, label: label.textContent }).toEqual({
            disabled: false,
            inputDisabled: false,
            label: "Choice",
        });
        addOption(control, "gamma", "Gamma");
        control.setAttribute("value", "gamma");
        shadowElement<HTMLSlotElement>(control, "slot").dispatchEvent(new Event("slotchange"));
        expect(input.value).toBe("Gamma");
        control.focus();
        expect(control.shadowRoot!.activeElement).toBe(input);
    });

    test("selects an option with ArrowDown and Enter", () => {
        const control = mountCombobox();
        const input = shadowElement<HTMLInputElement>(control, "input");
        const list = shadowElement<HTMLElement>(control, "[role='listbox']");
        let detail: unknown;
        control.addEventListener("change", (event) => {
            detail = (event as CustomEvent).detail;
        });
        input.focus();
        expect(list.hidden).toBe(false);
        expect(press(input, "ArrowDown").defaultPrevented).toBe(true);
        expect(input.getAttribute("aria-activedescendant")).toBe("option-0");
        expect(press(input, "Enter").defaultPrevented).toBe(true);
        expect({ value: control.value, inputValue: input.value, hidden: list.hidden, detail }).toEqual({
            value: "alpha",
            inputValue: "Alpha",
            hidden: true,
            detail: { value: "alpha", label: "Alpha", created: false },
        });
    });

    test("closes an empty result list with Escape", () => {
        const control = mountCombobox();
        const input = shadowElement<HTMLInputElement>(control, "input");
        const list = shadowElement<HTMLElement>(control, "[role='listbox']");
        input.focus();
        write(input, "missing");
        expect(list.querySelector(".empty")?.textContent).toBe("No results");
        expect(press(input, "Escape").defaultPrevented).toBe(true);
        expect({ hidden: list.hidden, expanded: input.getAttribute("aria-expanded") }).toEqual({
            hidden: true,
            expanded: "false",
        });
    });

    test("clears the selected value and emits a change event", () => {
        const control = mountCombobox({ value: "alpha" });
        const input = shadowElement<HTMLInputElement>(control, "input");
        const clearButton = shadowElement<HTMLButtonElement>(control, "[data-clear]");
        const chevron = shadowElement<SVGElement>(control, ".chevron");
        let detail: unknown;
        control.addEventListener("change", (event) => {
            detail = (event as CustomEvent).detail;
        });
        const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
        clearButton.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect({ value: control.value, inputValue: input.value, clearHidden: clearButton.hidden }).toEqual({
            value: "",
            inputValue: "",
            clearHidden: true,
        });
        expect(chevron.hasAttribute("hidden")).toBe(false);
        expect(detail).toEqual({ value: "", label: "", created: false });
    });

    test("creates a missing value from the rendered option", () => {
        const control = mountCombobox({ creatable: true });
        const input = shadowElement<HTMLInputElement>(control, "input");
        let detail: unknown;
        control.addEventListener("change", (event) => {
            detail = (event as CustomEvent).detail;
        });
        input.focus();
        write(input, "Gamma");
        const createOption = shadowElement<HTMLElement>(control, ".option.create");
        createOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        expect({ value: control.value, inputValue: input.value, detail }).toEqual({
            value: "Gamma",
            inputValue: "Gamma",
            detail: { value: "Gamma", label: "Gamma", created: true },
        });
    });

    test("removes view listeners when disconnected", () => {
        const control = mountCombobox();
        const input = shadowElement<HTMLInputElement>(control, "input");
        const list = shadowElement<HTMLElement>(control, "[role='listbox']");
        control.remove();
        list.hidden = true;
        input.dispatchEvent(new FocusEvent("focus"));
        expect(list.hidden).toBe(true);
    });
});
