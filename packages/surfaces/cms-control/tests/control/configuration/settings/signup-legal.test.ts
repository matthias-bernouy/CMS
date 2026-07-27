import { describe, expect, test } from "bun:test";
import { parseSettingsUpdateDto } from "cms-control/core/validation/settings/parseUpdateDto";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";

describe("signup legal settings DTO", () => {
    test("accepts the structured page-backed document list", () => {
        const signupLegalDocuments = [
            {
                key: "terms",
                label: "Terms of use",
                consentText: "I accept the terms.",
                pageId: "page-terms",
                enabled: true,
            },
        ];

        expect(parseSettingsUpdateDto({ "auth.signupLegalDocuments": signupLegalDocuments })).toEqual({
            auth: { signupLegalDocuments },
        });
    });

    test("rejects a non-array document list", () => {
        expect(() => parseSettingsUpdateDto({ "auth.signupLegalDocuments": "{}" })).toThrow(InvalidParam);
    });
});
