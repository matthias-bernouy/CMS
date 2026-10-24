import { describe, expect, test } from "bun:test";
import { mount as mountToggle } from "../../../packages/official-repository/collections/ulvia-official/blocs/forms/choices/ulvia-official-toggle/bloc";
import { mount as mountSelect } from "../../../packages/official-repository/collections/ulvia-official/blocs/forms/fields/ulvia-official-select/bloc";

describe("progressive official controls", () => {
    test("enhances a select created from its minimal native contract", () => {
        const root = document.createElement("div");
        root.setAttribute("cms-bloc", "ulvia-official-select");
        root.innerHTML = '<select aria-label="Viewport"><option value="desktop">Desktop</option></select>';
        document.body.append(root);

        const cleanup = mountSelect(root);

        expect(root.querySelector('[part="control"]')).not.toBeNull();
        expect(root.querySelector('[part="trigger"]')?.getAttribute("aria-label")).toBe("Viewport");
        expect(root.querySelectorAll('[part="option"]')).toHaveLength(1);
        expect(root.hasAttribute("data-ready")).toBe(true);
        root.querySelector<HTMLButtonElement>('[part="trigger"]')?.click();
        expect(root.hasAttribute("data-open")).toBe(true);
        cleanup?.();
        root.remove();
    });

    test("enhances a toggle created from its minimal native contract", () => {
        const root = document.createElement("div");
        root.setAttribute("cms-bloc", "ulvia-official-toggle");
        root.innerHTML = '<input type="checkbox" role="switch">';
        document.body.append(root);

        const cleanup = mountToggle(root);
        const input = root.querySelector<HTMLInputElement>("input")!;
        input.checked = true;
        input.dispatchEvent(new Event("change"));

        expect(root.querySelector('[part="track"]')).not.toBeNull();
        expect(root.querySelector('[part="thumb"]')).not.toBeNull();
        expect(root.hasAttribute("data-checked")).toBe(true);
        cleanup?.();
        root.remove();
    });
});
