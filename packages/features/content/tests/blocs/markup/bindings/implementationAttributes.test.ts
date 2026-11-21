import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { pageBlocHostAttributesIssue } from "content/blocs/core/markup/validation/contracts/hostAttributes";
import { nativeElementAttributesIssue } from "content/blocs/core/markup/validation/nativeElementPolicy";

function hostIssue(attributes: Record<string, string>, implementation = true): string | null {
    return pageBlocHostAttributesIssue(
        attributes,
        { id: "fixture-card", root: { accepts: ["div"] } },
        false,
        true,
        implementation,
    );
}

function nativeIssue(attributes: Record<string, string>, implementation = true): string | null {
    const { document } = parseHTML("<html><body><div></div></body></html>");
    const element = document.body.firstElementChild!;
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, value);
    }
    return nativeElementAttributesIssue(element, true, false, false, implementation);
}

test("host and native implementation attributes retain their dynamic value kinds", () => {
    for (const attributes of [
        { hidden: "{{ ready }}" },
        { id: "item-{{ item.id }}" },
        { tabindex: "{{ position }}" },
        { "data-track": "item-{{ item.id }}" },
        { "aria-label": "{{ item.label }}" },
    ]) {
        expect(hostIssue(attributes)).toBeNull();
        expect(nativeIssue(attributes)).toBeNull();
    }
    for (const hidden of ["before {{ ready }}", "{{ 'yes' }}"]) {
        expect(hostIssue({ hidden })).toContain("boolean attribute");
        expect(nativeIssue({ hidden })).toContain("boolean attribute");
    }
});

test("implementation validation continues to reject reserved and unknown attributes", () => {
    for (const attributes of [
        { "data-cms-private": "{{ item.id }}" },
        { style: "{{ item.style }}" },
        { "data-1bad": "{{ item.id }}" },
    ]) {
        expect(hostIssue(attributes)).not.toBeNull();
        expect(nativeIssue(attributes)).not.toBeNull();
    }
    expect(hostIssue({ "data-track": "{{ item.id }}" }, false)).not.toBeNull();
    expect(nativeIssue({ "data-track": "{{ item.id }}" }, false)).not.toBeNull();
});

test("static part values keep each context's independent grammar", () => {
    expect(hostIssue({ part: "heading-title" })).toBeNull();
    expect(nativeIssue({ part: "heading-title" })).toBeNull();
    expect(hostIssue({ part: "heading_title" })).not.toBeNull();
    expect(nativeIssue({ part: "heading_title" })).toBeNull();
});

test("native dynamic ARIA retains its separate validation path", () => {
    const attributes = { "aria-unknown": "{{ item.label }}" };
    expect(hostIssue(attributes)).not.toBeNull();
    expect(nativeIssue(attributes)).toBeNull();
});
