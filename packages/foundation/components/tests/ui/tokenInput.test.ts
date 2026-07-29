import { afterEach, describe, expect, test } from "bun:test";
import { TokenInput } from "../../src/ui/Form/Inputs/TokenInput/TokenInput";

const tag = "p9r-token-input-behavior";
if (!customElements.get(tag)) {
    customElements.define(tag, TokenInput);
}

afterEach(() => document.body.replaceChildren());

function addOption(control: TokenInput, value: string, label: string, disabled = false): void {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.disabled = disabled;
    control.append(option);
}

function mountTokenInput(attributes: Record<string, string> = {}, withOptions = true): TokenInput {
    const control = document.createElement(tag) as TokenInput;
    if (withOptions) {
        addOption(control, "alpha", "Alpha");
        addOption(control, "beta", "Beta");
    }
    for (const [name, value] of Object.entries(attributes)) {
        control.setAttribute(name, value);
    }
    document.body.append(control);
    return control;
}

function shadowElement<T extends Element>(control: TokenInput, selector: string): T {
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

function tokenLabels(control: TokenInput): string[] {
    return Array.from(
        control.shadowRoot!.querySelectorAll<HTMLElement>(".token > span"),
        (token) => token.textContent ?? "",
    );
}

describe("TokenInput", () => {
    test("syncs values, attributes, focus, and late slotted options", () => {
        const control = mountTokenInput({
            value: "alpha, missing",
            label: "Tags",
            placeholder: "Choose tags",
            disabled: "",
            creatable: "",
        });
        const input = shadowElement<HTMLInputElement>(control, "input");
        const label = shadowElement<HTMLElement>(control, ".label");
        const createButton = shadowElement<HTMLButtonElement>(control, "[data-create]");

        expect({ value: control.value, values: control.values, labels: tokenLabels(control) }).toEqual({
            value: "alpha,missing",
            values: ["alpha", "missing"],
            labels: ["Alpha", "missing"],
        });
        expect({ label: label.textContent, disabled: input.disabled, createHidden: createButton.hidden }).toEqual({
            label: "Tags",
            disabled: true,
            createHidden: false,
        });

        const values = control.values;
        values.push("outside");
        expect(control.values).toEqual(["alpha", "missing"]);
        control.disabled = false;
        control.removeAttribute("value");
        expect({ value: control.value, placeholder: input.placeholder, disabled: input.disabled }).toEqual({
            value: "",
            placeholder: "Choose tags",
            disabled: false,
        });

        addOption(control, "gamma", "Gamma label");
        control.setAttribute("value", "gamma");
        shadowElement<HTMLSlotElement>(control, "slot").dispatchEvent(new Event("slotchange"));
        expect(tokenLabels(control)).toEqual(["Gamma label"]);
        control.focus();
        expect(control.shadowRoot!.activeElement).toBe(input);
    });

    test("selects and removes options through keyboard and token controls", () => {
        const control = mountTokenInput();
        const input = shadowElement<HTMLInputElement>(control, "input");
        const list = shadowElement<HTMLElement>(control, "[role='listbox']");
        const changes: unknown[] = [];
        control.addEventListener("change", (event) => changes.push((event as CustomEvent).detail));

        input.focus();
        expect(list.hidden).toBe(false);
        expect(press(input, "ArrowDown").defaultPrevented).toBe(true);
        press(input, "ArrowDown");
        expect(press(input, "Enter").defaultPrevented).toBe(true);
        expect({ value: control.value, labels: tokenLabels(control), hidden: list.hidden }).toEqual({
            value: "beta",
            labels: ["Beta"],
            hidden: true,
        });
        expect(changes).toEqual([{ value: "beta", values: ["beta"], created: false }]);

        shadowElement<HTMLButtonElement>(control, "[aria-label='Remove Beta']").click();
        expect(control.value).toBe("");
        expect(changes.at(-1)).toEqual({ value: "", values: [], created: false });
        expect(control.shadowRoot!.activeElement).toBe(input);

        input.focus();
        press(input, "ArrowUp");
        press(input, "Enter");
        expect(control.value).toBe("alpha");
        expect(press(input, "Backspace").defaultPrevented).toBe(false);
        expect(control.value).toBe("");
    });

    test("creates free-form values without presenting an empty option list", () => {
        const control = mountTokenInput({ creatable: "" }, false);
        const input = shadowElement<HTMLInputElement>(control, "input");
        const labelRow = shadowElement<HTMLElement>(control, ".label-row");
        const list = shadowElement<HTMLElement>(control, "[role='listbox']");
        const createButton = shadowElement<HTMLButtonElement>(control, "[data-create]");
        const changes: unknown[] = [];
        control.addEventListener("change", (event) => {
            changes.push((event as CustomEvent).detail);
        });

        input.focus();
        expect({ listHidden: list.hidden, createHidden: createButton.hidden, labelRowHidden: labelRow.hidden }).toEqual(
            {
                listHidden: true,
                createHidden: true,
                labelRowHidden: true,
            },
        );
        write(input, " Gamma ");
        expect(press(input, "Enter").defaultPrevented).toBe(true);
        write(input, "Delta");
        expect(press(input, ",").defaultPrevented).toBe(true);
        expect({ value: control.value, changes }).toEqual({
            value: "Gamma,Delta",
            changes: [
                { value: "Gamma", values: ["Gamma"], created: true },
                { value: "Gamma,Delta", values: ["Gamma", "Delta"], created: true },
            ],
        });
    });

    test("renders an empty state when values must come from options", () => {
        const fixed = mountTokenInput({}, false);
        const fixedInput = shadowElement<HTMLInputElement>(fixed, "input");
        fixedInput.focus();
        expect(shadowElement<HTMLElement>(fixed, ".empty").textContent).toBe("No results");
        press(fixedInput, "ArrowDown");
        expect(press(fixedInput, "Escape").defaultPrevented).toBe(true);
        expect(fixed.value).toBe("");
    });

    test("removes its input listeners when disconnected", () => {
        const control = mountTokenInput();
        const input = shadowElement<HTMLInputElement>(control, "input");
        const list = shadowElement<HTMLElement>(control, "[role='listbox']");
        control.remove();
        list.hidden = true;
        input.dispatchEvent(new FocusEvent("focus"));
        expect(list.hidden).toBe(true);
    });
});
