import { describe, expect, test } from "bun:test";

import {
    formatMoney,
    majorToMinor,
    minorToMajor,
} from "../../../integrations/commerce/versions/1.0.0/blocs/commerce-offer-price-form/money.ts";
import {
    parseDate,
    profileFieldReady,
    PublicError,
    stripeEnrollmentComplete,
} from "../../../integrations/commerce/versions/1.0.0/blocs/commerce-offer-price-form/profile.ts";

describe("commerce offer price helpers", () => {
    test("converts decimal prices without floating-point rounding", () => {
        expect(majorToMinor("12,34")).toBe(1234);
        expect(majorToMinor("12.3")).toBe(1230);
        expect(majorToMinor("12.345")).toBeNaN();
        expect(minorToMajor(1234)).toBe("12.34");
        expect(formatMoney(1234, "eur", "fr-FR")).toContain("12,34");
    });

    test("validates calendar dates and ready profile fields", () => {
        expect(parseDate("2000-02-29")).toEqual({ year: 2000, month: 2, day: 29 });
        expect(() => parseDate("2001-02-29")).toThrow(PublicError);
        expect(profileFieldReady("birthDate", "2000-02-29")).toBe(true);
        expect(profileFieldReady("email", "seller@example.test")).toBe(true);
        expect(profileFieldReady("countryCode", "fr")).toBe(true);
        expect(profileFieldReady("countryCode", "be")).toBe(false);
    });

    test("keeps the complete Stripe enrollment contract explicit", () => {
        expect(stripeEnrollmentComplete({
            accountStatus: "active",
            stripeAccountApiVersion: "v2",
            applicationControlledRecipient: true,
            stripeTermsStatus: "accepted",
        })).toBe(true);
        expect(stripeEnrollmentComplete({
            accountStatus: "active",
            stripeAccountApiVersion: "v1",
            applicationControlledRecipient: true,
            stripeTermsStatus: "accepted",
        })).toBe(false);
    });
});
