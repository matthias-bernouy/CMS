import { afterEach, expect, test } from "bun:test";
import { applyControlAttribute } from "../../../src/browser/binding/reactive/controls/value";
import { serializeTypedForm } from "../../../src/browser/binding/submit/typed/serialize";
import { resetDom } from "../support/testUtils";
import { form } from "./formTestUtils";

class ExistingValueControl extends HTMLElement {
    static readonly formAssociated = true;

    get value(): string {
        return this.getAttribute("value") ?? "";
    }

    set value(value: string) {
        this.setAttribute("value", value);
    }
}

class ExistingToggleControl extends ExistingValueControl {
    checked = false;
}

customElements.define("test-existing-value-control", ExistingValueControl);
customElements.define("test-existing-toggle-control", ExistingToggleControl);
afterEach(resetDom);

test("custom controls retain their value contract when bound and submitted", () => {
    const target = form('<form><test-existing-value-control name="tags"></test-existing-value-control></form>');
    const control = target.firstElementChild as ExistingValueControl;
    applyControlAttribute(control, "value", ["tennis", "padel"]);
    expect(control.value).toBe("tennis,padel");
    expect(serializeTypedForm(target)).toEqual({ tags: "tennis,padel" });
    applyControlAttribute(control, "value", "tennis,squash");
    expect(serializeTypedForm(target)).toEqual({ tags: "tennis,squash" });
    applyControlAttribute(control, "value", []);
    expect(control.value).toBe("");
    expect(serializeTypedForm(target)).toEqual({ tags: "" });
});

test("switches use checked without replacing their submission value", () => {
    const target = form(
        '<form><test-existing-toggle-control name="enabled" value="published"></test-existing-toggle-control></form>',
    );
    const control = target.firstElementChild as ExistingToggleControl;
    applyControlAttribute(control, "checked", true);
    expect(control.checked).toBe(true);
    expect(control.value).toBe("published");
    expect(serializeTypedForm(target)).toEqual({ enabled: true });
    applyControlAttribute(control, "checked", false);
    expect(control.checked).toBe(false);
    expect(control.value).toBe("published");
    expect(serializeTypedForm(target)).toEqual({ enabled: false });
});

test("native multiple selections remain arrays and ordinary commas remain text", () => {
    const target = form(`<form>
        <select name="sports" multiple><option value="tennis">Tennis</option><option value="padel">Padel</option></select>
        <input name="label" value="one,two">
        <input type="number" name="quantity" value="0">
    </form>`);
    const select = target.querySelector("select")!;
    for (const option of Array.from(select.options)) {
        option.selected = true;
    }
    expect(serializeTypedForm(target)).toEqual({ sports: ["tennis", "padel"], label: "one,two", quantity: 0 });
    for (const option of Array.from(select.options)) {
        option.selected = false;
    }
    expect(serializeTypedForm(target)).toEqual({ sports: [], label: "one,two", quantity: 0 });
});

test("associated controls outside the form are read through their existing properties", () => {
    const target = form(
        '<form id="existing-control-form"></form><test-existing-value-control form="existing-control-form" name="tags" value="padel"></test-existing-value-control>',
    );
    expect(serializeTypedForm(target)).toEqual({ tags: "padel" });
});
