import { describe, test, expect, beforeAll } from "bun:test";
import { Checkbox } from "../src/ui/Form/Checkbox/Checkbox";
import { Switch } from "../src/ui/Form/Switch/Switch";

// These tests CHARACTERIZE the current toggle-control behaviour so the
// FormControlElement extraction can be proven behaviour-preserving. happy-dom
// supports attachInternals() but NOT real form integration (internals.form is
// null, form.reset() does not invoke formResetCallback, FormData ignores the
// control) — so we exercise the logic WE own (reflective accessors, default
// capture + formResetCallback called directly, inner-input sync, change events,
// indeterminate, aria), not the browser's form wiring.

beforeAll(() => {
    if (!customElements.get("w13c-checkbox")) {
        customElements.define("w13c-checkbox", Checkbox);
    }
    if (!customElements.get("w13c-switch")) {
        customElements.define("w13c-switch", Switch);
    }
});

function mount(tag: string, attrs: Record<string, string> = {}): any {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    return el;
}
const innerInput = (el: any): HTMLInputElement => el.shadowRoot!.querySelector("input")!;

describe.each(["w13c-checkbox", "w13c-switch"])("%s — shared form-control skeleton", (tag) => {
    test("checked/disabled/name/value reflect between property and attribute", () => {
        const el = mount(tag);
        el.checked = true;
        expect(el.hasAttribute("checked")).toBe(true);
        expect(el.checked).toBe(true);
        el.checked = false;
        expect(el.hasAttribute("checked")).toBe(false);
        expect(el.checked).toBe(false);
        el.disabled = true;
        expect(el.hasAttribute("disabled")).toBe(true);
        expect(el.disabled).toBe(true);
        el.name = "agree";
        expect(el.getAttribute("name")).toBe("agree");
        expect(el.name).toBe("agree");
        el.value = "yes";
        expect(el.getAttribute("value")).toBe("yes");
        expect(el.value).toBe("yes");
    });

    test("value getter defaults to 'on'", () => {
        expect(mount(tag).value).toBe("on");
    });

    test("inner <input> mirrors the checked attribute on connect", () => {
        expect(innerInput(mount(tag, { checked: "" })).checked).toBe(true);
        expect(innerInput(mount(tag)).checked).toBe(false);
    });

    test("changing the checked attribute after connect updates the inner input", () => {
        const el = mount(tag);
        const input = innerInput(el);
        el.setAttribute("checked", "");
        expect(input.checked).toBe(true);
        el.removeAttribute("checked");
        expect(input.checked).toBe(false);
    });

    test("an inner-input 'change' reflects to the host and re-dispatches 'change'", () => {
        const el = mount(tag);
        const input = innerInput(el);
        let fired = 0;
        el.addEventListener("change", () => fired++);
        input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        expect(el.hasAttribute("checked")).toBe(true);
        expect(fired).toBe(1);
    });

    test("formResetCallback() restores the boot-time checked default", () => {
        const el = mount(tag, { checked: "" }); // boot default = checked
        el.checked = false;
        expect(el.hasAttribute("checked")).toBe(false);
        el.formResetCallback();
        expect(el.hasAttribute("checked")).toBe(true);
    });
});

describe("checkbox-specific behaviour (must survive the refactor)", () => {
    test("indeterminate reflects between property and attribute", () => {
        const el = mount("w13c-checkbox");
        el.indeterminate = true;
        expect(el.hasAttribute("indeterminate")).toBe(true);
        expect(el.indeterminate).toBe(true);
    });

    test("a user change clears a pending indeterminate", () => {
        const el = mount("w13c-checkbox", { indeterminate: "" });
        const input = innerInput(el);
        input.indeterminate = false;
        input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        expect(el.hasAttribute("indeterminate")).toBe(false);
    });
});

describe("switch-specific behaviour (must survive the refactor)", () => {
    test("connect sets role=switch and aria-checked", () => {
        const el = mount("w13c-switch", { checked: "" });
        expect(el.getAttribute("role")).toBe("switch");
        expect(el.getAttribute("aria-checked")).toBe("true");
    });
});
