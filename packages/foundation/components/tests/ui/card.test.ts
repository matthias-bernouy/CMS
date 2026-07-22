import { describe, expect, test } from "bun:test";

import { Card } from "../../src/ui/Content/Card/Card";

if (!customElements.get("p9r-card-test")) {
    customElements.define("p9r-card-test", Card);
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Card", () => {
    test("tracks assigned header and footer slot content", async () => {
        const card = document.createElement("p9r-card-test");
        document.body.append(card);

        await flush();
        expect(card.hasAttribute("has-header")).toBe(false);
        expect(card.hasAttribute("has-footer")).toBe(false);

        const header = document.createElement("p");
        header.slot = "header";
        header.textContent = "Title";
        const footer = document.createElement("p");
        footer.slot = "footer";
        footer.textContent = "Footer";
        card.append(header, footer);

        await flush();
        expect(card.hasAttribute("has-header")).toBe(true);
        expect(card.hasAttribute("has-footer")).toBe(true);

        header.remove();

        await flush();
        expect(card.hasAttribute("has-header")).toBe(false);
        expect(card.hasAttribute("has-footer")).toBe(true);
    });
});
