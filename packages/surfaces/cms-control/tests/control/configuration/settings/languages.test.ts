import { describe, expect, test } from "bun:test";
import { ContentValidationError, defaultSystem, mergeSystemUpdate, validateSettingsPatch } from "@bernouy/cms-content";
import { parseSettingsUpdateDto } from "cms-control/core/validation/settings/parseUpdateDto";

describe("site language settings", () => {
    test("keeps an older site's default language without a migration", () => {
        const system = mergeSystemUpdate(defaultSystem(), { site: { language: "fr-FR" } as never });

        expect(system.site.language).toBe("fr-FR");
        expect(system.site.additionalLanguages).toEqual([]);
        expect(system.site.activeLanguages).toEqual([]);
    });

    test("never duplicates the default in the additional list", () => {
        const system = mergeSystemUpdate(defaultSystem(), {
            site: { language: "fr", additionalLanguages: ["de", "FR"], activeLanguages: ["de", "FR"] } as never,
        });

        expect(system.site.additionalLanguages).toEqual(["de"]);
        expect(system.site.activeLanguages).toEqual(["de"]);
    });

    test("parses, canonicalizes, and deduplicates additional languages", () => {
        const dto = parseSettingsUpdateDto({
            "site.language": "fr",
            "site.additionalLanguages": "en-us\nDE\nen-US",
            "site.activeLanguages": "DE\nde",
        });
        const validated = validateSettingsPatch(dto);

        expect(validated.site?.language).toBe("fr");
        expect(validated.site?.additionalLanguages).toEqual(["de", "en-US"]);
        expect(validated.site?.activeLanguages).toEqual(["de"]);
        expect(() => validateSettingsPatch({ site: { additionalLanguages: ["not_a_locale"] } })).toThrow(
            ContentValidationError,
        );
        expect(() => validateSettingsPatch({ site: { activeLanguages: ["not_a_locale"] } })).toThrow(
            ContentValidationError,
        );
    });
});
