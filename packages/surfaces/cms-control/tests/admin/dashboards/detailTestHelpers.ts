import { Button, Combobox, P9rInput, P9rSelect } from "@bernouy/components";
import { expect } from "bun:test";
import "../../../src/components/admin/Resources/Dashboards/widgets/w-detail/WDetail";

if (!customElements.get("p9r-input")) customElements.define("p9r-input", P9rInput);
if (!customElements.get("p9r-button")) customElements.define("p9r-button", Button);
if (!customElements.get("p9r-combobox")) customElements.define("p9r-combobox", Combobox);
if (!customElements.get("p9r-select")) customElements.define("p9r-select", P9rSelect);

export function changeDetailInput(detail: HTMLElement, fieldId: string, value: string): void {
    const control = detail.shadowRoot!.querySelector<HTMLElement & { shadowRoot: ShadowRoot }>(
        `[data-field-control='${fieldId}']`,
    )!;
    const input = control.shadowRoot.querySelector("input")!;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
}

export async function waitForDetail(predicate: () => boolean, tries = 60): Promise<void> {
    for (let index = 0; index < tries; index += 1) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(predicate()).toBeTrue();
}
