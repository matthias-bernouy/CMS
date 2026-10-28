import { expect, test } from "bun:test";
import { nativeAttributeValueIssue } from "@bernouy/cms-content";
import { validatePageDocument } from "@bernouy/cms-content/page-document";

const input = {
    id: "fixture-input",
    kind: "component" as const,
    root: { accepts: ["div" as const] },
    slots: {
        "": {
            accepts: [
                {
                    kind: "native-element" as const,
                    accepts: ["input" as const],
                    attributes: { type: { required: true, values: ["text"] } },
                },
            ],
            min: 1,
            max: 1,
        },
    },
};

test("shared collection texts remain valid on managed native text attributes", () => {
    const html =
        '<div cms-bloc="fixture-input"><input type="text" placeholder="{{ cms.i18n.demo.placeholder }}" aria-label="{{ cms.i18n.demo.label }}"></div>';
    expect(validatePageDocument(html, [input]).html).toContain('placeholder="{{ cms.i18n.demo.placeholder }}"');
    expect(nativeAttributeValueIssue("input", "placeholder", "Example {{ cms.i18n.demo.label }}")).toBeNull();
});

test("text references cannot relax URL, machine attribute, enum or malformed-expression validation", () => {
    const reference = "{{ cms.i18n.demo.label }}";
    expect(nativeAttributeValueIssue("img", "src", reference)).not.toBeNull();
    expect(nativeAttributeValueIssue("a", "href", reference)).not.toBeNull();
    expect(nativeAttributeValueIssue("input", "type", reference)).not.toBeNull();
    expect(nativeAttributeValueIssue("input", "placeholder", "{{ cms.i18n.demo.label")).not.toBeNull();
    expect(nativeAttributeValueIssue("input", "placeholder", "{{ cms.unknown }}")).not.toBeNull();
    expect(nativeAttributeValueIssue("input", "placeholder", "{{ data.value }}")).not.toBeNull();
    expect(() =>
        validatePageDocument(`<div cms-bloc="fixture-input"><input type="${reference}"></div>`, [input]),
    ).toThrow();
});
