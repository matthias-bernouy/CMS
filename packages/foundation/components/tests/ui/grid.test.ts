import { describe, expect, test } from "bun:test";

import { Grid } from "../../src/ui/Layout/Grid/Grid";

if (!customElements.get("p9r-grid-test")) {
    customElements.define("p9r-grid-test", Grid);
}

describe("Grid", () => {
    test("exposes max item width without replacing the responsive track sizing", () => {
        const grid = document.createElement("p9r-grid-test");
        const styles = grid.shadowRoot!.querySelector("style")!.textContent ?? "";

        expect(styles).toContain("grid-template-columns: repeat(auto-fill, minmax(min(var(--min), 100%), 1fr));");
        expect(styles).toContain("--item-max: none;");
        expect(styles).toContain(':host([max="md"])   { --item-max: 320px; }');
        expect(styles).toContain(':host([max]:not([max="none"])) ::slotted(*)');
        expect(styles).toContain(':host([justify-items="stretch"]) { --item-justify: stretch; }');
    });
});
