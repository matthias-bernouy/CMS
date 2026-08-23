import { expect, test } from "bun:test";
import { loadSection } from "./support";

type FaqItemElement = HTMLElement & { details?: HTMLDetailsElement };

export function registerFaqTests(): void {
    test("FAQ keeps editable answers and synchronizes native disclosures", async () => {
        const faq = await loadSection("basic-faq");
        const item = await loadSection("basic-faq-item");
        expect(faq.defaultContent.match(/<basic-faq-item\s/gu)).toHaveLength(3);
        expect(faq.defaultContent.match(/<h2\s/gu)).toHaveLength(1);
        expect(faq.defaultContent).not.toMatch(/\b(?:class|style)=/u);
        expect(item.defaultContent).toContain('slot="question"');

        const faqEditor = new faq.editor(document.createElement(faq.tag));
        expect(faqEditor.getContentSlots().find(({ slot }) => slot === "items")).toEqual({
            label: "Questions",
            slot: "items",
            accepts: [{ kind: "component", tag: "basic-faq-item" }],
            min: 1,
        });
        const itemEditor = new item.editor(document.createElement(item.tag));
        expect(itemEditor.getContentSlots()).toEqual([
            { label: "Question", slot: "question", accepts: [{ kind: "any-component" }], min: 1, max: 1 },
            { label: "Answer", accepts: [{ kind: "any-component" }], min: 1 },
        ]);

        const disclosure = document.createElement(item.tag) as FaqItemElement;
        disclosure.setAttribute("open", "true");
        document.body.append(disclosure);
        const details = disclosure.shadowRoot?.querySelector("details");
        expect(details).not.toBeNull();
        expect(disclosure.shadowRoot?.querySelector("style")?.textContent).toContain('[part="summary"]:hover');
        expect(details?.open).toBeTrue();
        disclosure.removeAttribute("open");
        expect(details?.open).toBeFalse();
        if (details) {
            details.open = true;
            details.dispatchEvent(new Event("toggle"));
        }
        expect(disclosure.hasAttribute("open")).toBeTrue();
        disclosure.remove();
    });
}
