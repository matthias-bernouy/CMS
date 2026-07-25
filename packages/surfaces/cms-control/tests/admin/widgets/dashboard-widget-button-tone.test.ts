import { describe, expect, test } from "bun:test";
import { setP9rButtonTone } from "../../../src/components/admin/Resources/Dashboards/widgets/shared";

describe("dashboard widget button tones", () => {
    test.each([
        ["primary", "primary", "filled"],
        ["secondary", null, "outlined"],
        ["danger", "danger", "ghost"],
        [undefined, null, "outlined"],
    ] as const)("maps %s actions to p9r-button attributes", (tone, color, variant) => {
        const button = document.createElement("p9r-button");
        button.setAttribute("color", "danger");
        button.setAttribute("variant", "filled");

        setP9rButtonTone(button, tone);

        expect(button.getAttribute("color")).toBe(color);
        expect(button.getAttribute("variant")).toBe(variant);
        expect(button.hasAttribute("tone")).toBeFalse();
    });
});
