import { afterEach, expect, test } from "bun:test";
import { mount } from "../../../../official-repository/collections/ulvia-official/blocs/forms/choices/ulvia-official-multi-select/bloc";

afterEach(() => {
    document.body.replaceChildren();
});

test("official multi-select owns its controls and restores the authored select", () => {
    document.body.innerHTML = `
        <div cms-bloc="ulvia-official-multi-select">
            <span part="control">
                <select name="roles" multiple aria-label="Roles">
                    <option value="editor">Editor</option>
                    <option value="admin">Administrator</option>
                </select>
                <span part="listbox" role="listbox" aria-multiselectable="true" tabindex="0"></span>
            </span>
        </div>
    `;
    const root = document.querySelector<HTMLElement>('[cms-bloc="ulvia-official-multi-select"]');
    const select = root?.querySelector<HTMLSelectElement>("select");
    if (!root || !select) {
        throw new Error("Missing multi-select fixture");
    }

    const cleanup = mount(root);
    const choices = root.querySelectorAll<HTMLButtonElement>('button[role="option"]');

    expect(root.hasAttribute("data-ready")).toBe(true);
    expect(select.hidden).toBe(true);
    expect(choices).toHaveLength(2);
    choices[1]?.click();
    expect(select.options[1]?.selected).toBe(true);

    cleanup?.();
    expect(select.hidden).toBe(false);
    expect(select.getAttribute("aria-hidden")).toBeNull();
    expect(select.getAttribute("tabindex")).toBeNull();
});
