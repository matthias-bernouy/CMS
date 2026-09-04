import { afterEach, describe, expect, test } from "bun:test";
import { Combobox } from "../../src/ui/Form/Selection/Combobox/Combobox";

const tag = "p9r-combobox-behavior";
if (!customElements.get(tag)) {
    customElements.define(tag, Combobox);
}

afterEach(() => document.body.replaceChildren());

type MountOptions = {
    accessibleName?: string;
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    invalid?: boolean;
    hint?: string;
    hintLevel?: string;
    creatable?: boolean;
    remoteSearch?: boolean;
};

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
    if (options.accessibleName !== undefined) {
        control.setAttribute("aria-label", options.accessibleName);
    }
    if (options.placeholder !== undefined) {
        control.setAttribute("placeholder", options.placeholder);
    }
    control.toggleAttribute("disabled", options.disabled ?? false);
    control.toggleAttribute("required", options.required ?? false);
    control.toggleAttribute("invalid", options.invalid ?? false);
    if (options.hint !== undefined) {
        control.setAttribute("hint", options.hint);
    }
    if (options.hintLevel !== undefined) {
        control.setAttribute("hint-level", options.hintLevel);
    }
    control.toggleAttribute("creatable", options.creatable ?? false);
    control.toggleAttribute("remote-search", options.remoteSearch ?? false);
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
        const control = mountCombobox({
            value: "alpha",
            accessibleName: "Token value",
            placeholder: "Pick one",
            disabled: true,
        });
        const input = shadowElement<HTMLInputElement>(control, "input");
        const label = shadowElement<HTMLElement>(control, ".label");
        expect({ value: control.value, inputValue: input.value, placeholder: input.placeholder }).toEqual({
            value: "alpha",
            inputValue: "Alpha",
            placeholder: "Pick one",
        });
        expect(input.disabled).toBe(true);
        expect(input.getAttribute("aria-label")).toBe("Token value");
        control.removeAttribute("aria-label");
        expect(input.hasAttribute("aria-label")).toBeFalse();
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

    test("exposes required and invalid hints to the internal combobox", () => {
        const control = mountCombobox({
            required: true,
            invalid: true,
            hint: "This field is required.",
            hintLevel: "error",
        });
        const input = shadowElement<HTMLInputElement>(control, "input");
        const hint = shadowElement<HTMLElement>(control, "#hint");

        expect({
            required: input.required,
            ariaRequired: input.getAttribute("aria-required"),
            ariaInvalid: input.getAttribute("aria-invalid"),
            describedBy: input.getAttribute("aria-describedby"),
            hint: hint.textContent,
            hintLevel: hint.dataset.level,
            hintHidden: hint.hidden,
        }).toEqual({
            required: true,
            ariaRequired: "true",
            ariaInvalid: "true",
            describedBy: "hint",
            hint: "This field is required.",
            hintLevel: "error",
            hintHidden: false,
        });

        control.removeAttribute("required");
        control.removeAttribute("invalid");
        control.removeAttribute("hint");
        expect({
            required: input.required,
            ariaRequired: input.hasAttribute("aria-required"),
            ariaInvalid: input.hasAttribute("aria-invalid"),
            describedBy: input.hasAttribute("aria-describedby"),
            hintHidden: hint.hidden,
        }).toEqual({
            required: false,
            ariaRequired: false,
            ariaInvalid: false,
            describedBy: false,
            hintHidden: true,
        });
    });

    test("connects the input to its listbox and announces the selected option", () => {
        const control = mountCombobox({ value: "beta" });
        const input = shadowElement<HTMLInputElement>(control, "input");
        const list = shadowElement<HTMLElement>(control, "[role='listbox']");

        input.focus();
        const options = Array.from(list.querySelectorAll<HTMLElement>("[role='option']"));
        expect(list.getAttribute("popover")).toBe("manual");
        expect(input.getAttribute("aria-controls")).toBe(list.id);
        expect([input.selectionStart, input.selectionEnd]).toEqual([0, "Beta".length]);
        expect(options.map((option) => option.getAttribute("aria-selected"))).toEqual(["false", "true"]);
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

    test("creates a value even when existing options partially match it", () => {
        const control = mountCombobox({ creatable: true });
        const input = shadowElement<HTMLInputElement>(control, "input");
        let detail: unknown;
        control.addEventListener("change", (event) => {
            detail = (event as CustomEvent).detail;
        });
        input.focus();
        write(input, "Al");
        expect(shadowElement<HTMLElement>(control, ".option.create").textContent).toContain('Add "Al"');
        expect(shadowElement<HTMLElement>(control, "[role='option']:not(.create)").textContent).toContain("Alpha");
        expect(press(input, "Enter").defaultPrevented).toBe(true);
        expect({ value: control.value, inputValue: input.value, detail }).toEqual({
            value: "Al",
            inputValue: "Al",
            detail: { value: "Al", label: "Al", created: true },
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

    test("keeps local filtering as the default and only emits remote searches when opted in", () => {
        const local = mountCombobox();
        const localInput = shadowElement<HTMLInputElement>(local, "input");
        let localSearches = 0;
        local.addEventListener("combobox-search", () => {
            localSearches += 1;
        });
        localInput.focus();
        write(localInput, "bet");
        expect(shadowElement<HTMLElement>(local, "[role='listbox']").textContent).toContain("Beta");
        expect(shadowElement<HTMLElement>(local, "[role='listbox']").textContent).not.toContain("Alpha");
        expect(localSearches).toBe(0);

        document.body.replaceChildren();
        const remote = mountCombobox({ remoteSearch: true });
        const remoteInput = shadowElement<HTMLInputElement>(remote, "input");
        let query = "";
        remote.addEventListener("combobox-search", (event) => {
            query = (event as CustomEvent<{ query: string }>).detail.query;
        });
        remoteInput.focus();
        write(remoteInput, "server query");
        expect(query).toBe("server query");
        expect(shadowElement<HTMLElement>(remote, "[role='listbox']").textContent).toContain("Alpha");
    });

    test("exposes opt-in loading and pagination actions", () => {
        const control = mountCombobox({ remoteSearch: true });
        const input = shadowElement<HTMLInputElement>(control, "input");
        input.focus();
        control.setAttribute("loading", "");
        expect(shadowElement<HTMLElement>(control, ".loading").textContent).toBe("Loading…");
        control.removeAttribute("loading");
        control.setAttribute("has-more", "");
        let loads = 0;
        control.addEventListener("combobox-load-more", () => {
            loads += 1;
        });
        shadowElement<HTMLButtonElement>(control, ".load-more").dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
        );
        expect(loads).toBe(1);
    });
});
