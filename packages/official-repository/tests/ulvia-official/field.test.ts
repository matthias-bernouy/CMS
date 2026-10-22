import { afterEach, expect, test } from "bun:test";
import { CMS_BROWSER_RUNTIME_ABI, registerBloc } from "@bernouy/cms-content/browser";
import { mount } from "../../collections/ulvia-official/blocs/forms/structure/field/ulvia-official-field/bloc";

afterEach(() => {
    document.body.replaceChildren();
});

test("connects its label to a form control exposed by a nested composite Bloc", () => {
    document.body.innerHTML = `
        <div cms-bloc="ulvia-official-field">
            <label part="field-label">
                <span cms-bloc="ulvia-official-field-caption"><span>Search</span></span>
            </label>
            <div part="field-control">
                <div cms-bloc="test-field-search">
                    <div cms-bloc="test-field-search-input"><input type="search"></div>
                </div>
            </div>
            <div part="field-description">Filter Pages by name</div>
            <div part="field-error" role="alert"></div>
        </div>`;
    const root = document.querySelector<HTMLElement>('[cms-bloc="ulvia-official-field"]');
    if (!root) {
        throw new Error("Expected Field root");
    }
    const cleanup = mount(root);

    registerBloc("test-field-search", {}, CMS_BROWSER_RUNTIME_ABI);
    registerBloc("test-field-search-input", {}, CMS_BROWSER_RUNTIME_ABI);

    const label = root.querySelector<HTMLLabelElement>('[part~="field-label"]');
    const input = root.querySelector<HTMLInputElement>('input[type="search"]');
    expect(input?.id).toMatch(/^ulvia-form-control-/u);
    expect(label?.htmlFor).toBe(input?.id);
    expect(input?.getAttribute("aria-describedby")).toContain(`${input?.id}-field-description`);

    cleanup?.();
});
