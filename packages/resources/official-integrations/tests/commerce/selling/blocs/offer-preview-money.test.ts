import { describe, expect, test } from "bun:test";
import {
    formatMoney,
    parseBooleanAttribute,
} from "../../../../integrations/domains/commerce/versions/1.0.0/blocs/commerce-offer-preview/money";

describe("Commerce offer preview money", () => {
    test("omits insignificant decimals from whole amounts", () => {
        expect(formatMoney(11_000, "eur", "fr-FR", false)).toBe("110 €");
    });

    test("keeps real decimals when fractional prices are enabled", () => {
        expect(formatMoney(11_050, "eur", "fr-FR", false)).toBe("110,50 €");
    });

    test("rejects an inconsistent fractional amount when whole units are required", () => {
        expect(formatMoney(11_050, "eur", "fr-FR", true)).toBe("");
        expect(formatMoney(11_000, "eur", "fr-FR", true)).toBe("110 €");
    });

    test("does not treat the bound false string as a present boolean attribute", () => {
        expect(parseBooleanAttribute("true")).toBeTrue();
        expect(parseBooleanAttribute("false")).toBeFalse();
        expect(parseBooleanAttribute(null)).toBeFalse();
    });
});
