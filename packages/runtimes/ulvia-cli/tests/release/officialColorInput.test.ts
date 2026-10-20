import { afterEach, expect, test } from "bun:test";
import { mount } from "../../../../official-repository/collections/ulvia-official/blocs/forms/fields/ulvia-official-color-input/bloc";

afterEach(() => {
    document.body.replaceChildren();
});

test("official color input closes on Escape and restores focus", async () => {
    document.body.innerHTML = `
        <div cms-bloc="ulvia-official-color-input">
            <span part="trigger-shell"></span>
            <input type="color" aria-label="Brand colour" value="#086c55">
            <span part="popover" hidden></span>
        </div>
    `;
    const root = document.querySelector<HTMLElement>('[cms-bloc="ulvia-official-color-input"]');
    if (!root) {
        throw new Error("Missing color input fixture");
    }

    const cleanup = mount(root);
    const trigger = root.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]');
    const popover = root.querySelector<HTMLElement>('[part="popover"]');
    trigger?.click();
    await Promise.resolve();
    expect(popover?.hasAttribute("hidden")).toBe(false);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(popover?.hasAttribute("hidden")).toBe(true);
    expect(document.activeElement).toBe(trigger);

    cleanup?.();
});
