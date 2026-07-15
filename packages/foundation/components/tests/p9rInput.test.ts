import { afterEach, describe, expect, test } from "bun:test";
import { P9rInput } from "../src/ui/Form/P9rInput/P9rInput";

const tag = "p9r-input-constraints";
if (!customElements.get(tag)) customElements.define(tag, P9rInput);

afterEach(() => document.body.replaceChildren());

describe("P9rInput", () => {
    test("forwards numeric constraints to its native input", () => {
        const control = document.createElement(tag);
        control.setAttribute("type", "number");
        control.setAttribute("min", "0");
        control.setAttribute("max", "10");
        control.setAttribute("step", "0.5");
        document.body.append(control);

        const input = control.shadowRoot!.querySelector("input")!;
        expect({ type: input.type, min: input.min, max: input.max, step: input.step })
            .toEqual({ type: "number", min: "0", max: "10", step: "0.5" });

        control.removeAttribute("max");
        control.setAttribute("step", "1");
        expect({ max: input.getAttribute("max"), step: input.step }).toEqual({ max: null, step: "1" });
    });
});
