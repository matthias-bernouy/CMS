import { expect, test } from "bun:test";
import { loadSection } from "./support";

const sections = [
    {
        tag: "basic-feature-section",
        requiredMarkup: ['slot="items"', "<h2 ", "<basic-card"],
        slots: ["eyebrow", "title", "description", "items", "actions"],
    },
    {
        tag: "basic-media-section",
        requiredMarkup: ["<h2 ", "<basic-button"],
        slots: ["eyebrow", "title", "description", undefined, "actions", "media"],
    },
    {
        tag: "basic-cta",
        requiredMarkup: ['slot="actions"', "<h2 ", "<basic-button"],
        slots: ["eyebrow", "title", "description", "actions"],
    },
] as const;

export function registerContentSectionTests(): void {
    test("content sections keep semantic headings and intrinsic editable layouts", async () => {
        for (const testCase of sections) {
            const section = await loadSection(testCase.tag);
            expect(section.manifest["default-tag"]).toBe(testCase.tag);
            expect(section.defaultContent.match(/<h2\s/gu)).toHaveLength(1);
            for (const markup of testCase.requiredMarkup) {
                expect(section.defaultContent).toContain(markup);
            }
            expect(section.defaultContent).not.toMatch(/\b(?:class|style)=/u);

            const editor = new section.editor(document.createElement(testCase.tag));
            expect(editor.getContentSlots().map((slot) => slot.slot)).toEqual([...testCase.slots]);
            expect(editor.getSettings().map((group) => group.label)).toEqual(["Layout", "Style"]);

            const element = document.createElement(testCase.tag);
            document.body.append(element);
            expect(element.shadowRoot?.querySelector("section")).not.toBeNull();
            const styles = element.shadowRoot?.querySelector("style")?.textContent ?? "";
            for (const appearance of ["soft", "filled", "outlined"]) {
                expect(styles).toContain(`:host([appearance="${appearance}"])`);
            }
            expect(styles).not.toContain("@media");
            element.remove();
        }
    });
}
