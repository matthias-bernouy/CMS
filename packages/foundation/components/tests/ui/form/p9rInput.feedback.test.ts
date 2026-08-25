import { afterEach, describe, expect, test } from "bun:test";
import { P9rInput } from "../../../src/ui/Form/Inputs/P9rInput/P9rInput";

const tag = "p9r-input-feedback";
if (!customElements.get(tag)) {
    customElements.define(tag, class FeedbackInput extends P9rInput {});
}

afterEach(() => document.body.replaceChildren());

describe("P9rInput feedback", () => {
    test("does not reserve label space when label and help are absent", () => {
        const control = document.createElement(tag);
        document.body.append(control);

        const row = control.shadowRoot!.querySelector<HTMLElement>(".label-row")!;
        expect(row.hidden).toBe(true);

        control.setAttribute("help", "More context");
        expect(row.hidden).toBe(false);
        control.removeAttribute("help");
        expect(row.hidden).toBe(true);
    });

    test("keeps placeholder, hint, and help as separate content", () => {
        const control = document.createElement(tag);
        control.setAttribute("label", "Path");
        control.setAttribute("placeholder", "/about-morrow");
        control.setAttribute("hint", 'Starts with "/". Use letters, numbers and hyphens only.');
        control.setAttribute("help", "The path determines the public URL.");
        document.body.append(control);

        const input = control.shadowRoot!.querySelector<HTMLInputElement>("input")!;
        const hint = control.shadowRoot!.querySelector<HTMLElement>(".hint")!;
        const helpButton = control.shadowRoot!.querySelector<HTMLButtonElement>(".help-button")!;
        const helpText = control.shadowRoot!.querySelector<HTMLElement>(".help-text")!;

        expect(input.placeholder).toBe("/about-morrow");
        expect(hint.textContent).toBe('Starts with "/". Use letters, numbers and hyphens only.');
        expect(hint.hidden).toBe(false);
        expect(helpButton.hidden).toBe(false);
        expect(helpButton.getAttribute("aria-label")).toBe("More information about Path");
        expect(helpText.textContent).toBe("The path determines the public URL.");
    });

    test("accepts rich help through the named slot", () => {
        const control = document.createElement(tag);
        const help = document.createElement("strong");
        help.slot = "help";
        help.textContent = "Public URL guidance";
        control.append(help);
        document.body.append(control);

        const helpButton = control.shadowRoot!.querySelector<HTMLButtonElement>(".help-button")!;
        const helpText = control.shadowRoot!.querySelector<HTMLElement>(".help-text")!;
        expect(helpButton.hidden).toBe(false);
        expect(helpText.hidden).toBe(true);
    });

    test("opens help on click and closes it with Escape", () => {
        const control = document.createElement(tag);
        control.setAttribute("label", "Path");
        control.setAttribute("help", "The path determines the public URL.");
        document.body.append(control);

        const button = control.shadowRoot!.querySelector<HTMLButtonElement>(".help-button")!;
        button.click();
        expect(button.getAttribute("aria-expanded")).toBe("true");

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(button.getAttribute("aria-expanded")).toBe("false");
    });

    test("uses a custom error as blocking validity and restores the hint when cleared", () => {
        const form = document.createElement("form");
        const control = document.createElement(tag) as P9rInput;
        control.setAttribute("name", "path");
        control.setAttribute("hint", "Use letters, numbers and hyphens only.");
        form.append(control);
        document.body.append(form);

        control.setCustomValidity("A page already uses this path.");

        const input = control.shadowRoot!.querySelector<HTMLInputElement>("input")!;
        const hint = control.shadowRoot!.querySelector<HTMLElement>(".hint")!;
        const error = control.shadowRoot!.querySelector<HTMLElement>(".error")!;
        expect(control.error).toBe("A page already uses this path.");
        expect(control.checkValidity()).toBe(false);
        expect(error.textContent).toBe("A page already uses this path.");
        expect(error.hidden).toBe(false);
        expect(hint.hidden).toBe(true);
        expect(input.getAttribute("aria-invalid")).toBe("true");
        expect(input.getAttribute("aria-errormessage")).toBe("error");
        expect(input.getAttribute("aria-describedby")).toBe("error");

        control.setCustomValidity("");

        expect(control.checkValidity()).toBe(true);
        expect(error.hidden).toBe(true);
        expect(hint.hidden).toBe(false);
        expect(input.hasAttribute("aria-invalid")).toBe(false);
        expect(input.hasAttribute("aria-errormessage")).toBe(false);
        expect(input.getAttribute("aria-describedby")).toBe("hint");
    });

    test("uses a stable required message instead of the browser message", () => {
        const control = document.createElement(tag) as P9rInput;
        control.required = true;
        document.body.append(control);

        expect(control.checkValidity()).toBe(false);
        expect(control.validationMessage).toBe("This field is required.");
        expect(control.shadowRoot!.querySelector(".error")?.textContent).toBe("This field is required.");
    });
});
