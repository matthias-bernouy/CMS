import { describe, test, expect } from "bun:test";
import { upgradeProperty } from "../src/base/Component";

// A minimal element with a reflecting accessor, like the toolkit's form controls.
class UpProbe extends HTMLElement {
    get checked() { return this.hasAttribute("checked"); }
    set checked(v: boolean) { v ? this.setAttribute("checked", "") : this.removeAttribute("checked"); }
}
if (!customElements.get("up-probe")) customElements.define("up-probe", UpProbe);

describe("upgradeProperty", () => {
    test("routes a value set BEFORE upgrade through the prototype setter", () => {
        const el = document.createElement("up-probe") as UpProbe;
        // Simulate `el.checked = true` assigned before the class applied: an own
        // data property that shadows the prototype accessor and would be lost.
        Object.defineProperty(el, "checked", { value: true, configurable: true, writable: true, enumerable: true });
        expect(Object.prototype.hasOwnProperty.call(el, "checked")).toBe(true);

        upgradeProperty(el, "checked");

        expect(Object.prototype.hasOwnProperty.call(el, "checked")).toBe(false); // shadow removed
        expect(el.hasAttribute("checked")).toBe(true);                           // re-applied via setter
        expect(el.checked).toBe(true);
    });

    test("is a no-op when there is no own property to upgrade", () => {
        const el = document.createElement("up-probe") as UpProbe;
        upgradeProperty(el, "checked");
        expect(el.hasAttribute("checked")).toBe(false);
    });
});
