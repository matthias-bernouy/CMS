import { assertCondition } from "./types";
import type { QueryCase } from "./types";

export const contentQueries: readonly QueryCase[] = [
    {
        family: "content",
        capability: "site.get",
        assert: (out) => assertCondition(typeof out.name === "string" && Number.isSafeInteger(out.revision)),
    },
    {
        family: "content",
        capability: "localization.get",
        assert: (out) => assertCondition(typeof out.language === "string" && Array.isArray(out.activeLanguages)),
    },
    {
        family: "content",
        capability: "pages.list",
        input: () => ({ limit: 25 }),
        assert: (out) => assertCondition(Array.isArray(out.items) && out.items.length > 0),
    },
    {
        family: "content",
        capability: "pages.editor-catalogue",
        assert: (out) => assertCondition(Array.isArray(out.items) && out.items.length > 0),
    },
    { family: "content", capability: "site-blocs.list", assert: (out) => assertCondition(Array.isArray(out.items)) },
    ...["theme.get", "theme.read"].map(
        (capability): QueryCase => ({
            family: "content",
            capability,
            input: ({ collectionId }) => ({ collectionId }),
            assert: (out, context) =>
                assertCondition(out.collectionId === context.collectionId && Array.isArray(out.tokens)),
        }),
    ),
    ...["localization.texts.get", "localization.texts.read"].map(
        (capability): QueryCase => ({
            family: "content",
            capability,
            input: ({ collectionId }) => ({ collectionId }),
            assert: (out, context) =>
                assertCondition(out.collectionId === context.collectionId && Array.isArray(out.items)),
        }),
    ),
    {
        family: "content",
        capability: "examples.list",
        input: ({ collectionId }) => ({ collectionId, locale: "en", limit: 25 }),
        assert: (out, context) =>
            assertCondition(out.collectionId === context.collectionId && Array.isArray(out.items)),
    },
];
