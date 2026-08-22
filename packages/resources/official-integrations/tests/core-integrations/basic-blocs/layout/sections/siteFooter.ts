import { expect, test } from "bun:test";
import { loadSection } from "./support";

export function registerSiteFooterTest(): void {
    test("site footer keeps literal links in a configurable footer landmark", async () => {
        const section = await loadSection("basic-site-footer");
        expect(section.manifest["default-tag"]).toBe(section.tag);
        expect(section.defaultContent.match(/<a\s/gu)).toHaveLength(4);
        expect(section.defaultContent).toContain('<a slot="brand" href="/">');
        expect(section.defaultContent).toContain('<a slot="navigation" href="/contact">');
        expect(section.defaultContent).not.toMatch(/\b(?:class|style)=/u);

        const editor = new section.editor(document.createElement(section.tag));
        expect(editor.getContentSlots()).toEqual([
            { label: "Brand", slot: "brand", accepts: [{ kind: "any-component" }], max: 1 },
            {
                label: "Description",
                slot: "description",
                accepts: [{ kind: "component", tag: "p" }],
                max: 1,
            },
            {
                label: "Navigation",
                slot: "navigation",
                accepts: [{ kind: "component", tag: "a" }],
                min: 1,
            },
            { label: "Actions", slot: "actions", accepts: [{ kind: "any-component" }], max: 2 },
            { label: "Legal", slot: "legal", accepts: [{ kind: "any-component" }], max: 1 },
        ]);

        const footer = document.createElement(section.tag);
        footer.setAttribute("navigation-label", "Useful links");
        document.body.append(footer);
        expect(footer.shadowRoot?.querySelector("footer")).not.toBeNull();
        expect(footer.shadowRoot?.querySelector("nav")?.getAttribute("aria-label")).toBe("Useful links");
        footer.setAttribute("navigation-label", "Company links");
        expect(footer.shadowRoot?.querySelector("nav")?.getAttribute("aria-label")).toBe("Company links");
        const styles = footer.shadowRoot?.querySelector("style")?.textContent ?? "";
        expect(styles).toContain("repeat(auto-fit");
        expect(styles).not.toContain("@media");
        footer.remove();
    });
}
