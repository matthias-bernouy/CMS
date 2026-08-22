import { expect, test } from "bun:test";
import { loadSection } from "./support";

export function registerHeroTest(): void {
    test("hero exposes one SEO heading and intrinsic editable regions", async () => {
        const section = await loadSection("basic-hero");
        expect(section.manifest["default-tag"]).toBe(section.tag);
        expect(section.defaultContent.match(/<h1\s/gu)).toHaveLength(1);
        expect(section.defaultContent).toContain('slot="title"');
        expect(section.defaultContent).toContain('slot="actions"');
        expect(section.defaultContent).not.toMatch(/\b(?:class|style)=/u);

        const editor = new section.editor(document.createElement(section.tag));
        expect(editor.getContentSlots()).toEqual([
            { label: "Eyebrow", slot: "eyebrow", accepts: [{ kind: "any-component" }], max: 1 },
            {
                label: "Title",
                slot: "title",
                accepts: [{ kind: "component", tag: "h1" }],
                min: 1,
                max: 1,
            },
            {
                label: "Description",
                slot: "description",
                accepts: [{ kind: "component", tag: "p" }],
                max: 1,
            },
            { label: "Supporting content", accepts: [{ kind: "any-component" }], max: 1 },
            { label: "Actions", slot: "actions", accepts: [{ kind: "any-component" }], max: 2 },
            { label: "Media", slot: "media", accepts: [{ kind: "any-component" }], max: 1 },
        ]);

        const hero = document.createElement(section.tag);
        document.body.append(hero);
        expect(hero.shadowRoot?.querySelector("section")).not.toBeNull();
        const styles = hero.shadowRoot?.querySelector("style")?.textContent ?? "";
        expect(styles).toContain("repeat(auto-fit");
        expect(styles).toContain(':host([media-position="start"])');
        for (const appearance of ["soft", "filled", "outlined"]) {
            expect(styles).toContain(`:host([appearance="${appearance}"])`);
        }
        expect(styles).not.toContain("@media");
        hero.remove();
    });
}
