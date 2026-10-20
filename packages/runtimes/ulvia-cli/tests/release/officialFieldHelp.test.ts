import { afterEach, expect, test } from "bun:test";
import { mount } from "../../../../official-repository/collections/ulvia-official/blocs/forms/structure/field/ulvia-official-field-help/bloc";

afterEach(() => {
    document.body.replaceChildren();
});

test("official field help owns and controls its accessible tooltip", () => {
    document.body.innerHTML = `
        <div cms-bloc="ulvia-official-field-help">
            <button type="button" data-field-help-trigger aria-expanded="false">Email help</button>
            <span data-field-help-panel hidden>We only use this address to reply.</span>
        </div>
    `;
    const root = document.querySelector<HTMLElement>('[cms-bloc="ulvia-official-field-help"]');
    if (!root) {
        throw new Error("Missing field help fixture");
    }

    const cleanup = mount(root);
    const trigger = root.querySelector<HTMLButtonElement>("[data-field-help-trigger]");
    const panel = root.querySelector<HTMLElement>("[data-field-help-panel]");
    expect(trigger?.textContent).toBe("?");
    expect(trigger?.getAttribute("aria-label")).toBe("Email help");
    expect(panel?.getAttribute("role")).toBe("tooltip");

    trigger?.click();
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(trigger?.getAttribute("aria-describedby")).toBe(panel?.id);
    expect(panel?.hasAttribute("hidden")).toBe(false);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(trigger?.hasAttribute("aria-describedby")).toBe(false);
    expect(panel?.hasAttribute("hidden")).toBe(true);
    expect(document.activeElement).toBe(trigger);

    const unrelated = document.createElement("button");
    document.body.append(unrelated);
    unrelated.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.activeElement).toBe(unrelated);

    cleanup?.();
});

test("official field help keeps its tooltip inside the viewport", () => {
    document.body.innerHTML = `
        <div cms-bloc="ulvia-official-field-help">
            <button type="button" data-field-help-trigger>Email help</button>
            <span data-field-help-panel hidden>Helpful content.</span>
        </div>
    `;
    const root = document.querySelector<HTMLElement>('[cms-bloc="ulvia-official-field-help"]')!;
    const panel = root.querySelector<HTMLElement>("[data-field-help-panel]")!;
    panel.getBoundingClientRect = () => ({ left: -8, right: 280 }) as DOMRect;

    const cleanup = mount(root);
    root.querySelector<HTMLButtonElement>("[data-field-help-trigger]")?.click();

    expect(panel.style.getPropertyValue("--ulvia-official-field-help-shift-x")).toBe("24px");
    cleanup?.();
});
