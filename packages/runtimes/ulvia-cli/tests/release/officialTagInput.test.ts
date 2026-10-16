import { afterEach, expect, test } from "bun:test";
import { mount } from "../../../../official-repository/collections/ulvia-official/blocs/forms/fields/advanced/ulvia-official-tag-input/bloc";

afterEach(() => {
    document.body.replaceChildren();
});

test("official tag input keeps the authored input as its form source", () => {
    document.body.innerHTML = `
        <div cms-bloc="ulvia-official-tag-input">
            <span part="control"><span part="draft"></span><input name="languages" value='["en"]'></span>
            <span part="tags" role="list"></span>
            <span part="hint"></span>
            <span part="status" aria-live="polite"></span>
        </div>
    `;
    const root = document.querySelector<HTMLElement>('[cms-bloc="ulvia-official-tag-input"]');
    const source = root?.querySelector<HTMLInputElement>('input[name="languages"]');
    if (!root || !source) {
        throw new Error("Missing tag input fixture");
    }

    const cleanup = mount(root);
    const draft = root.querySelector<HTMLInputElement>('input[part="input"]');

    expect(source.getAttribute("aria-hidden")).toBe("true");
    expect(source.tabIndex).toBe(-1);
    expect(draft).not.toBeNull();
    expect(draft).not.toBe(source);
    expect(draft?.getAttribute("aria-hidden")).toBeNull();

    cleanup?.();
    expect(source.getAttribute("aria-hidden")).toBeNull();
    expect(source.getAttribute("tabindex")).toBeNull();
});
