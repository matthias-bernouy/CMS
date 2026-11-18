import { randomUUID } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";

/** Independent expected values are selected before mutation, rather than learned from its subsequent reader. */
export function settingsReadChange(
    capability: string,
    before: Readonly<Record<string, unknown>>,
    collectionId: string,
    marker = `Performance ${randomUUID()}`,
) {
    const expectedRevision = Number(before.revision);
    assertCondition(Number.isSafeInteger(expectedRevision) && expectedRevision >= 0);
    if (capability === "site.get") {
        return {
            capability: "site.update",
            input: { expectedRevision, name: marker, visible: true },
            assert: (output: unknown) => {
                const row = requireRecord(output);
                assertCondition(
                    row.revision === expectedRevision + 1 && row.name === marker && row.visible === true,
                    "settings-read-site-stale",
                );
            },
        };
    }
    if (capability === "localization.get") {
        const language = before.language === "fr" ? "en" : "fr";
        const additionalLanguages = [language === "fr" ? "en" : "fr"];
        return {
            capability: "localization.update",
            input: { expectedRevision, language, additionalLanguages, activeLanguages: additionalLanguages },
            assert: (output: unknown) => {
                const row = requireRecord(output);
                assertCondition(
                    row.revision === expectedRevision + 1 &&
                        row.language === language &&
                        canonicalizeIJson(row.additionalLanguages) === canonicalizeIJson(additionalLanguages) &&
                        canonicalizeIJson(row.activeLanguages) === canonicalizeIJson(additionalLanguages),
                    "settings-read-localization-stale",
                );
            },
        };
    }
    if (capability.startsWith("localization.texts.")) {
        assertCondition(
            Array.isArray(before.items) && before.items.some((item) => requireRecord(item).id === "greeting"),
            "settings-read-text-fixture-missing",
        );
        return {
            capability: "localization.text.save",
            input: { expectedRevision, collectionId, textId: "greeting", locale: "en", value: marker },
            assert: (output: unknown) => {
                const row = requireRecord(output);
                assertCondition(
                    row.revision === expectedRevision + 1 &&
                        row.collectionId === collectionId &&
                        row.locale === "en" &&
                        Array.isArray(row.items) &&
                        row.items.some(
                            (item) =>
                                requireRecord(item).id === "greeting" && requireRecord(item).overrideValue === marker,
                        ),
                    "settings-read-text-stale",
                );
            },
        };
    }
    assertCondition(capability === "theme.get" || capability === "theme.read");
    const token = requireRecord(before.token);
    assertCondition(
        before.sourceFound === true &&
            before.hasToken === true &&
            typeof before.profileId === "string" &&
            before.profileId.length > 0 &&
            typeof token.id === "string" &&
            token.id.length > 0,
        "settings-read-theme-fixture-missing",
    );
    const value = token.value === "#456789" ? "#abcdef" : "#456789";
    return {
        capability: "theme.token.save",
        input: { expectedRevision, themeId: before.profileId, tokenId: token.id, mode: "light", value },
        assert: (output: unknown) => {
            const row = requireRecord(output);
            const current = requireRecord(row.token);
            assertCondition(
                row.revision === expectedRevision + 1 &&
                    row.collectionId === collectionId &&
                    row.profileId === before.profileId &&
                    row.mode === "light" &&
                    row.sourceFound === true &&
                    row.hasToken === true &&
                    current.id === token.id &&
                    current.value === value &&
                    current.overridden === true &&
                    Array.isArray(row.tokens) &&
                    row.tokens.some(
                        (item) => requireRecord(item).id === token.id && requireRecord(item).value === value,
                    ),
                "settings-read-theme-stale",
            );
        },
    };
}
