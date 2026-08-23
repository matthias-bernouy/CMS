import { afterEach, describe, expect, test } from "bun:test";
import { P9rInput } from "../../src/ui/Form/Inputs/P9rInput/P9rInput";

const tag = "p9r-input-constraints";
if (!customElements.get(tag)) {
    customElements.define(tag, P9rInput);
}

afterEach(() => document.body.replaceChildren());

describe("P9rInput", () => {
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

        const hint = control.shadowRoot!.querySelector<HTMLElement>(".hint")!;
        const meta = control.shadowRoot!.querySelector<HTMLElement>(".meta")!;
        expect(input.getAttribute("aria-invalid")).toBe("true");
        expect(meta.hidden).toBe(false);
        expect(hint.dataset.level).toBe("error");

        input.value = "contact@example.com";
        input.dispatchEvent(new Event("input", { bubbles: true }));

        expect(input.checkValidity()).toBe(true);
        expect(input.hasAttribute("aria-invalid")).toBe(false);
        expect(meta.hidden).toBe(true);
    });
});
