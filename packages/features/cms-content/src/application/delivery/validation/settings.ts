import { array, fields, flag, literal, optional, nullable, record, text, variant } from "./values";
import { pageReference } from "./pages";

const defaults = fields({ light: optional(text), dark: optional(text) });
const token = fields({
    id: text,
    variable: text,
    label: text,
    description: text,
    type: literal("color", "font-family", "length", "number", "shadow", "value"),
    defaults: optional(defaults),
});
const owner = variant("kind", {
    integration: fields({ kind: literal("integration"), integrationId: text, dependencies: optional(array(text)) }),
    contribution: fields({ kind: literal("contribution"), contributionId: text, tokenImports: optional(array(text)) }),
});
const themeSource = fields({
    id: text,
    label: text,
    supportsModes: flag,
    owner: optional(owner),
    categories: array(fields({ id: text, label: text, description: text, tokens: array(token) })),
    fontFaces: optional(
        array(
            fields({
                id: text,
                family: text,
                source: text,
                weight: text,
                style: literal("normal", "italic", "oblique"),
                display: literal("auto", "block", "swap", "fallback", "optional"),
            }),
        ),
    ),
});
const organization = fields({
    name: text,
    legalName: text,
    description: text,
    logo: text,
    email: text,
    telephone: text,
    address: fields({
        streetAddress: text,
        postalCode: text,
        addressLocality: text,
        addressRegion: text,
        addressCountry: text,
    }),
    sameAs: array(text),
});
export const settings = fields({
    site: fields({
        name: text,
        favicon: text,
        visible: flag,
        host: text,
        language: text,
        activeLanguages: optional(array(text)),
        organization,
        notFound: nullable(pageReference),
        forbidden: nullable(pageReference),
        serverError: nullable(pageReference),
        login: nullable(pageReference),
    }),
    theme: fields({
        activeThemeId: text,
        sources: array(themeSource),
        themes: array(fields({ id: text, name: text, values: fields({ light: record(text), dark: record(text) }) })),
    }),
    security: fields({ connectExtras: array(text), mediaExtras: array(text) }),
});
