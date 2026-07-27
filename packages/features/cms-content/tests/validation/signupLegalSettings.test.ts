import { describe, expect, test } from "bun:test";
import { ContentValidationError, validateSettingsPatch } from "@bernouy/cms-content";

const document = {
    key: " terms ",
    label: " Terms of use ",
    consentText: " I explicitly accept. ",
    pageId: " page-terms ",
    enabled: true,
};

describe("signup legal system settings", () => {
    test("normalizes a complete page-backed document", () => {
        expect(validateSettingsPatch({ auth: { signupLegalDocuments: [document] } }).auth).toEqual({
            signupLegalDocuments: [
                {
                    key: "terms",
                    label: "Terms of use",
                    consentText: "I explicitly accept.",
                    pageId: "page-terms",
                    enabled: true,
                },
            ],
        });
    });

    test("rejects duplicate keys and incomplete records", () => {
        expect(() => validateSettingsPatch({ auth: { signupLegalDocuments: [document, { ...document }] } })).toThrow(
            ContentValidationError,
        );
        expect(() =>
            validateSettingsPatch({
                auth: { signupLegalDocuments: [{ ...document, consentText: "" }] },
            }),
        ).toThrow(ContentValidationError);
    });
});
