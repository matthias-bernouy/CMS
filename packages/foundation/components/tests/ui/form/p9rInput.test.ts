import { afterEach, describe, expect, test } from "bun:test";
import { P9rInput } from "../../../src/ui/Form/Inputs/P9rInput/P9rInput";
import { Textarea } from "../../../src/ui/Form/Inputs/Textarea/Textarea";

const tag = "p9r-input-constraints";
if (!customElements.get(tag)) {
    customElements.define(tag, P9rInput);
}
const textareaTag = "p9r-textarea-accessibility";
if (!customElements.get(textareaTag)) {
    customElements.define(textareaTag, Textarea);
}

afterEach(() => document.body.replaceChildren());

describe("P9rInput", () => {
    test("associates its label, descriptions, and text-entry attributes", () => {
        const control = document.createElement(tag);
        control.setAttribute("label", "Email");
        control.setAttribute("hint", "Use your work address");
        control.setAttribute("max-count", "80");
        control.setAttribute("autocomplete", "email");
        control.setAttribute("enterkeyhint", "send");
        control.setAttribute("pattern", ".+@.+");
        document.body.append(control);

        const label = control.shadowRoot!.querySelector<HTMLLabelElement>("label")!;
        const input = control.shadowRoot!.querySelector<HTMLInputElement>("input")!;
        expect({ labelFor: label.htmlFor, inputId: input.id }).toEqual({ labelFor: "input", inputId: "input" });
        expect({
            autocomplete: input.autocomplete,
            enterKeyHint: input.getAttribute("enterkeyhint"),
            pattern: input.pattern,
            describedBy: input.getAttribute("aria-describedby"),
        }).toEqual({
            autocomplete: "email",
            enterKeyHint: "send",
            pattern: ".+@.+",
            describedBy: "hint counter",
        });
    });

    test("exposes one composed input event per native input event", () => {
        const control = document.createElement(tag);
        document.body.append(control);
        const input = control.shadowRoot!.querySelector<HTMLInputElement>("input")!;
        let inputEvents = 0;
        control.addEventListener("input", () => {
            inputEvents += 1;
        });
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        expect(inputEvents).toBe(1);
    });

    test("exposes one composed change event for a native change", () => {
        const control = document.createElement(tag);
        document.body.append(control);
        const input = control.shadowRoot!.querySelector<HTMLInputElement>("input")!;
        let changeEvents = 0;
        control.addEventListener("change", () => {
            changeEvents += 1;
        });
        input.dispatchEvent(new Event("change", { bubbles: true }));
        expect(changeEvents).toBe(1);
    });

    test("forwards numeric constraints and the input mode to its native input", () => {
        const control = document.createElement(tag);
        control.setAttribute("type", "number");
        control.setAttribute("inputmode", "decimal");
        control.setAttribute("min", "0");
        control.setAttribute("max", "10");
        control.setAttribute("step", "0.5");
        document.body.append(control);

        const input = control.shadowRoot!.querySelector("input")!;
        expect({
            type: input.type,
            inputMode: input.inputMode,
            min: input.min,
            max: input.max,
            step: input.step,
        }).toEqual({
            type: "number",
            inputMode: "decimal",
            min: "0",
            max: "10",
            step: "0.5",
        });

        control.removeAttribute("max");
        control.setAttribute("inputmode", "numeric");
        control.setAttribute("step", "1");
        expect({ inputMode: input.inputMode, max: input.getAttribute("max"), step: input.step }).toEqual({
            inputMode: "numeric",
            max: null,
            step: "1",
        });
    });

    test("participates in form validation and exposes the native error", () => {
        const form = document.createElement("form");
        const control = document.createElement(tag) as P9rInput;
        control.setAttribute("name", "email");
        control.setAttribute("type", "email");
        control.setAttribute("value", "not-an-email");
        form.append(control);
        document.body.append(form);

        const input = control.shadowRoot!.querySelector("input")!;
        expect(input.checkValidity()).toBe(false);
        control.dispatchEvent(new Event("invalid"));

        const error = control.shadowRoot!.querySelector<HTMLElement>(".error")!;
        const meta = control.shadowRoot!.querySelector<HTMLElement>(".meta")!;
        expect(input.getAttribute("aria-invalid")).toBe("true");
        expect(meta.hidden).toBe(false);
        expect(error.textContent).toBe("Enter a valid email address.");
        expect(error.hidden).toBe(false);

        input.value = "contact@example.com";
        input.dispatchEvent(new Event("input", { bubbles: true }));

        expect(input.checkValidity()).toBe(true);
        expect(input.hasAttribute("aria-invalid")).toBe(false);
        expect(meta.hidden).toBe(true);
    });
});

describe("Textarea", () => {
    test("associates metadata and exposes required validity", () => {
        const control = document.createElement(textareaTag);
        control.setAttribute("label", "Notes");
        control.setAttribute("hint", "Add context");
        control.setAttribute("required", "");
        control.setAttribute("autocomplete", "off");
        document.body.append(control);

        const label = control.shadowRoot!.querySelector<HTMLLabelElement>("label")!;
        const textarea = control.shadowRoot!.querySelector<HTMLTextAreaElement>("textarea")!;
        expect({
            labelFor: label.htmlFor,
            textareaId: textarea.id,
            required: textarea.required,
            autocomplete: textarea.autocomplete,
            describedBy: textarea.getAttribute("aria-describedby"),
        }).toEqual({
            labelFor: "ta",
            textareaId: "ta",
            required: true,
            autocomplete: "off",
            describedBy: "hint",
        });
        control.dispatchEvent(new Event("invalid"));
        expect(textarea.getAttribute("aria-invalid")).toBe("true");

        let changeEvents = 0;
        control.addEventListener("change", () => {
            changeEvents += 1;
        });
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        expect(changeEvents).toBe(1);
    });
});
