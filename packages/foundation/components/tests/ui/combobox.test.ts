import { afterEach, describe, expect, test } from "bun:test";
import { Combobox } from "../../src/ui/Form/Selection/Combobox/Combobox";

const tag = "p9r-combobox-behavior";
if (!customElements.get(tag)) {
    customElements.define(tag, Combobox);
}

afterEach(() => document.body.replaceChildren());

function mountSelectedCombobox(): Combobox {
    const control = document.createElement(tag) as Combobox;
    const option = document.createElement("option");
    option.value = "alpha";
    option.textContent = "Alpha";
    control.append(option);
    control.setAttribute("value", option.value);
    document.body.append(control);
    return control;
}

describe("Combobox", () => {
    test("reflects the current input text in clear-button visibility", () => {
        const control = mountSelectedCombobox();
        const input = control.shadowRoot!.querySelector<HTMLInputElement>("input")!;
        const clearButton = control.shadowRoot!.querySelector<HTMLButtonElement>("[data-clear]")!;

        expect(clearButton.hidden).toBe(false);

        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        expect(clearButton.hidden).toBe(true);

        input.value = "   ";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        expect(clearButton.hidden).toBe(false);

        input.value = "Al";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        expect(clearButton.hidden).toBe(false);
    });
});
