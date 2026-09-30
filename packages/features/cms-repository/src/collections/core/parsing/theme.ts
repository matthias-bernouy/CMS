import type { CollectionTheme, CollectionThemeToken, CollectionThemeTokenType } from "../../interfaces/CollectionTheme";
import { invalid } from "../errors";
import { array, identifier, keys, record, string, unique } from "../values";

const TYPES = new Set<CollectionThemeTokenType>(["color", "font-family", "length", "number", "shadow", "value"]);
const NAME = /^[a-z][a-z0-9-]*$/;

function name(value: unknown, path: string): string {
    const parsed = identifier(value, path);
    if (!NAME.test(parsed)) {
        invalid("must use lowercase words and hyphens", path);
    }
    return parsed;
}
function label(value: unknown, path: string): string {
    const parsed = string(value, 120, path);
    if (!parsed.trim()) {
        invalid("must not be blank", path);
    }
    return parsed;
}
function css(value: unknown, path: string): string {
    const parsed = string(value, 256, path);
    if (!parsed.trim() || /[;{}<>\x00-\x1f]/u.test(parsed) || /(?:url|expression)\s*\(/iu.test(parsed)) {
        invalid("invalid theme token value", path);
    }
    return parsed;
}
export function parseCollectionTheme(input: unknown): CollectionTheme {
    const source = record(input, "$.theme");
    keys(source, ["label", "categories"], "$.theme");
    const categories = array(source.categories, 16, "$.theme.categories").map((entry, index) => {
        const path = `$.theme.categories[${index}]`;
        const category = record(entry, path);
        keys(category, ["id", "label", "description", "tokens"], path);
        const tokens = array(category.tokens, 64, `${path}.tokens`).map((item, offset) => {
            const tokenPath = `${path}.tokens[${offset}]`;
            const token = record(item, tokenPath);
            keys(token, ["id", "label", "description", "type", "defaults"], tokenPath);
            if (!TYPES.has(token.type as CollectionThemeTokenType)) {
                invalid("unsupported token type", `${tokenPath}.type`);
            }
            const defaults = record(token.defaults, `${tokenPath}.defaults`);
            keys(defaults, ["light", "dark"], `${tokenPath}.defaults`);
            return {
                id: name(token.id, `${tokenPath}.id`),
                label: label(token.label, `${tokenPath}.label`),
                ...(token.description === undefined
                    ? {}
                    : { description: string(token.description, 500, `${tokenPath}.description`) }),
                type: token.type as CollectionThemeTokenType,
                defaults: {
                    light: css(defaults.light, `${tokenPath}.defaults.light`),
                    ...(defaults.dark === undefined ? {} : { dark: css(defaults.dark, `${tokenPath}.defaults.dark`) }),
                },
            } satisfies CollectionThemeToken;
        });
        unique(
            tokens.map((token) => token.id),
            `${path}.tokens`,
        );
        return {
            id: name(category.id, `${path}.id`),
            label: label(category.label, `${path}.label`),
            ...(category.description === undefined
                ? {}
                : { description: string(category.description, 500, `${path}.description`) }),
            tokens,
        };
    });
    unique(
        categories.map((category) => category.id),
        "$.theme.categories",
    );
    unique(
        categories.flatMap((category) => category.tokens.map((token) => token.id)),
        "$.theme.tokens",
    );
    return { label: label(source.label, "$.theme.label"), categories };
}
