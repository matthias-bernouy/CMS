import { afterEach, describe, expect, test } from "bun:test";
import { resetDom, text } from "../support/testUtils";
import { mount } from "./compiledTemplateTestUtils";

afterEach(resetDom);

describe("CompiledTemplate — text and attributes", () => {
    test("mounts a fragment and binds text and attributes", () => {
        const { host } = mount(
            `
            <p>Hello {{ name }}</p>
            <a href="/users/{{ id }}" title="{{ name }}">Open</a>
        `,
            { name: "Ada", id: 1 },
        );

        expect(text(host.querySelector("p"))).toBe("Hello Ada");
        expect(host.querySelector("a")!.getAttribute("href")).toBe("/users/1");
        expect(host.querySelector("a")!.getAttribute("title")).toBe("Ada");
    });

    test("updates live sites without replacing unrelated nodes", () => {
        const { host, region } = mount(
            `
            <label>{{ label }}</label>
            <input name="email">
            <a href="/users/{{ id }}">Open</a>
        `,
            { label: "Email", id: 1 },
        );
        const input = host.querySelector("input")!;
        const link = host.querySelector("a")!;

        region.update({ value: { label: "Work email", id: 2 } });

        expect(text(host.querySelector("label"))).toBe("Work email");
        expect(host.querySelector("input")).toBe(input);
        expect(host.querySelector("a")).toBe(link);
        expect(link.getAttribute("href")).toBe("/users/2");
    });

    test("uses existing interpolation rules for misses and filters", () => {
        const { host } = mount(
            `<p>{{ name | up }} / {{ missing }}</p>`,
            { name: "ada" },
            { up: (value: unknown) => String(value).toUpperCase() },
        );

        expect(text(host.querySelector("p"))).toBe("ADA /");
    });
});

class ValueControl extends HTMLElement {
    static formAssociated = true;
    readonly received: string[] = [];
    get value(): string {
        return this.received.at(-1) ?? "";
    }
    set value(value: string) {
        this.received.push(value);
    }
}
customElements.define("test-value-control", ValueControl);

test("custom form controls use ordinary value interpolation and preserve mounted elements", () => {
    const { host, region } = mount('<test-value-control value="{{ name }}"></test-value-control>', { name: "Initial" });
    const control = host.firstElementChild as ValueControl;
    expect(control.value).toBe("Initial");
    control.value = "Local draft";
    region.update({ value: { name: "Initial" } });
    expect(control.value).toBe("Local draft");
    region.update({ value: { name: "Updated" } });
    expect(control.value).toBe("Updated");
    expect(host.firstElementChild).toBe(control);
});

test("disposing an ordinary attribute binding cancels its queued control update", async () => {
    const { region } = mount('<test-late-control value="{{ name }}"></test-late-control>', { name: "Initial" });
    region.unmount();
    const received: string[] = [];
    customElements.define(
        "test-late-control",
        class extends HTMLElement {
            static formAssociated = true;
            get value(): string {
                return received.at(-1) ?? "";
            }
            set value(value: string) {
                received.push(value);
            }
        },
    );
    await Promise.resolve();
    expect(received).toEqual([]);
});

test("native elements are not arbitrary property receivers and nested reads own their contents", () => {
    const { host } = mount(
        '<div value="{{ name }}"></div><section cms-source="/other"><test-value-control value="{{ name }}"></test-value-control></section>',
        { name: "Initial" },
    );
    expect((host.querySelector("test-value-control") as ValueControl).received).toEqual([]);
    expect("value" in host.querySelector("div")!).toBe(false);
});

test("a bound native checkbox receives booleans and retains a local edit on an unchanged refresh", () => {
    const { host, region } = mount(
        '<input type="checkbox" cms-bind-boolean-checked="enabled"><span>{{ name }}</span>',
        {
            enabled: false,
            name: "Initial",
        },
    );
    const input = host.querySelector("input")!;
    expect(input.checked).toBe(false);
    input.click();
    expect(input.checked).toBe(true);
    region.update({ value: { enabled: false, name: "Refreshed" } });
    expect(input.checked).toBe(true);
    expect(host.querySelector("span")!.textContent).toBe("Refreshed");
    region.update({ value: { enabled: true } });
    region.update({ value: { enabled: false } });
    expect(input.checked).toBe(false);
    for (const value of ["false", "true", {}, undefined, null]) {
        region.update({ value: { enabled: value } });
        expect(input.checked).toBe(false);
    }
    region.update({ value: { enabled: true } });
    expect(input.checked).toBe(true);
    expect(host.querySelector("input")).toBe(input);
});

test("native text and select bindings preserve drafts until their bound value changes", () => {
    const { host, region } = mount(
        '<input value="{{ query }}"><select value="{{ status }}"><option value="">All</option><option value="active">Active</option></select><input type="file" value="{{ query }}">',
        { query: "Initial", status: "active" },
    );
    const input = host.querySelector("input")!;
    const select = host.querySelector("select")!;
    expect([input.value, select.value]).toEqual(["Initial", "active"]);
    input.value = "Unsaved";
    input.focus();
    input.setSelectionRange(1, 4);
    select.value = "";
    region.update({ value: { query: "Initial", status: "active" } });
    expect([input.value, select.value]).toEqual(["Unsaved", ""]);
    expect([document.activeElement, input.selectionStart, input.selectionEnd]).toEqual([input, 1, 4]);
    region.update({ value: { query: "Submitted", status: "" } });
    expect([input.value, select.value]).toEqual(["Submitted", ""]);
    region.update({ value: {} });
    expect(input.value).toBe("");
    expect(host.querySelector<HTMLInputElement>('input[type="file"]')!.value).toBe("");
});

test("boolean attribute bindings remove false flags without replacing the focused control", () => {
    const { host, region } = mount('<input cms-bind-boolean-invalid="failed" cms-bind-boolean-required="required">', {
        failed: true,
        required: false,
    });
    const input = host.querySelector("input")!;
    expect(input.getAttribute("invalid")).toBe("");
    expect(input.required).toBe(false);
    input.focus();
    input.value = "Keep this draft";
    input.setSelectionRange(1, 4);
    for (const failed of [false, undefined, null, "true", "false", 1]) {
        region.update({ value: { failed, required: true } });
        expect(input.hasAttribute("invalid")).toBe(false);
        expect(input.required).toBe(true);
        expect([input.value, input.selectionStart, input.selectionEnd]).toEqual(["Keep this draft", 1, 4]);
        expect(document.activeElement).toBe(input);
    }
    region.update({ value: { failed: true } });
    expect(input.hasAttribute("invalid")).toBe(true);
    expect(input.required).toBe(false);
});

test("unchanged external validation bindings leave local field validation feedback intact", () => {
    const { host, region } = mount('<input cms-bind-boolean-invalid="failed" hint="{{ message }}">', {
        failed: false,
        message: "",
    });
    const input = host.querySelector("input")!;
    input.setAttribute("invalid", "");
    input.setAttribute("hint", "This field is required.");
    region.update({ value: { failed: false, message: "", unrelated: "Changed" } });
    expect(input.hasAttribute("invalid")).toBe(true);
    expect(input.getAttribute("hint")).toBe("This field is required.");
    region.update({ value: { failed: true, message: "Directory unavailable" } });
    expect(input.getAttribute("hint")).toBe("Directory unavailable");
    region.update({ value: { failed: false, message: "" } });
    expect(input.hasAttribute("invalid")).toBe(false);
    expect(input.getAttribute("hint")).toBe("");
});

test("multiple select options use boolean attributes and retain edits until their bound selection changes", () => {
    const { host, region } = mount(
        '<select multiple><option value="a" cms-bind-boolean-selected="a">A</option><option value="b" cms-bind-boolean-selected="b">B</option></select>',
        { a: true, b: false },
    );
    const select = host.querySelector("select")!;
    expect(Array.from(select.options, (option) => option.selected)).toEqual([true, false]);
    select.options[1]!.selected = true;
    region.update({ value: { a: true, b: false } });
    expect(Array.from(select.options, (option) => option.selected)).toEqual([true, true]);
    region.update({ value: { a: false, b: true } });
    region.update({ value: { a: false, b: false } });
    expect(Array.from(select.options, (option) => option.selected)).toEqual([false, false]);
    expect(host.querySelector("select")).toBe(select);
});
