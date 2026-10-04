import type { CollectionTheme, CollectionThemeToken, CollectionThemeTokenType } from "../../interfaces/CollectionTheme";
import type { CollectionDependency } from "../../interfaces/CollectionRelease";
import { invalid } from "../errors";
import { collectionThemeSourceId, collectionThemeTokenId } from "../namespace";
import { array, identifier, integer, keys, record, string, unique } from "../values";

const TYPES = new Set<CollectionThemeTokenType>(["color", "font-family", "length", "number", "shadow", "value"]);
const NAME = /^[a-z][a-z0-9-]*$/;
const VARIABLE_REFERENCE = /var\(\s*--([a-z][a-z0-9-]*)/giu;

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
export function parseCollectionTheme(
    input: unknown,
    collectionId: string,
    dependencies: readonly CollectionDependency[] = [],
): CollectionTheme {
    collectionThemeSourceId(collectionId);
    const source = record(input, "$.theme");
    keys(source, ["label", "categories"], "$.theme");
    const categories = array(source.categories, 16, "$.theme.categories").map((entry, index) => {
        const path = `$.theme.categories[${index}]`;
        const category = record(entry, path);
        keys(category, ["id", "label", "description", "tokens"], path);
        const tokens = array(category.tokens, 64, `${path}.tokens`).map((item, offset) => {
            const tokenPath = `${path}.tokens[${offset}]`;
            const token = record(item, tokenPath);
            keys(token, ["id", "generation", "label", "description", "type", "defaults"], tokenPath);
            if (!TYPES.has(token.type as CollectionThemeTokenType)) {
                invalid("unsupported token type", `${tokenPath}.type`);
            }
            const defaults = record(token.defaults, `${tokenPath}.defaults`);
            keys(defaults, ["light", "dark"], `${tokenPath}.defaults`);
            const id = name(token.id, `${tokenPath}.id`);
            collectionThemeTokenId(collectionId, id);
            return {
                id,
                generation:
                    token.generation === undefined
                        ? 1
                        : integer(token.generation, 1, Number.MAX_SAFE_INTEGER, `${tokenPath}.generation`),
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
    const theme = { label: label(source.label, "$.theme.label"), categories };
    validateThemeReferences(theme, collectionId, dependencies);
    return theme;
}

function validateThemeReferences(
    theme: CollectionTheme,
    collectionId: string,
    dependencies: readonly CollectionDependency[],
): void {
    const tokens = theme.categories.flatMap((category) => category.tokens);
    const local = new Map(tokens.map((token) => [collectionThemeTokenId(collectionId, token.id), token]));
    const imported = new Set(
        dependencies.flatMap((dependency) =>
            dependency.imports.themeTokens.map(({ id }) => collectionThemeTokenId(dependency.collectionId, id)),
        ),
    );
    const namespaces = [collectionId, ...dependencies.map((dependency) => dependency.collectionId)].sort(
        (left, right) => right.length - left.length,
    );
    const graph = new Map(tokens.map((token) => [token.id, new Set<string>()]));
    for (const [categoryIndex, category] of theme.categories.entries()) {
        for (const [tokenIndex, token] of category.tokens.entries()) {
            for (const mode of ["light", "dark"] as const) {
                const value = token.defaults[mode];
                if (value === undefined) {
                    continue;
                }
                const path = `$.theme.categories[${categoryIndex}].tokens[${tokenIndex}].defaults.${mode}`;
                for (const variable of references(value)) {
                    const target = local.get(variable);
                    if (target) {
                        graph.get(token.id)!.add(target.id);
                        validateReferenceType(token, target, value, variable, path);
                        continue;
                    }
                    if (imported.has(variable)) {
                        continue;
                    }
                    if (namespaces.some((namespace) => variable.startsWith(`${namespace}-`))) {
                        invalid(`unknown or unimported theme token --${variable}`, path);
                    }
                }
            }
        }
    }
    assertAcyclicTheme(graph);
}

function references(value: string): string[] {
    return [...value.matchAll(VARIABLE_REFERENCE)].map((match) => match[1]!);
}

function validateReferenceType(
    source: CollectionThemeToken,
    target: CollectionThemeToken,
    value: string,
    variable: string,
    path: string,
): void {
    const exact = new RegExp(`^var\\(\\s*--${variable}\\s*\\)$`, "iu").test(value);
    if (exact && source.type !== "value" && target.type !== "value" && source.type !== target.type) {
        invalid(`cannot use ${target.type} token --${variable} as ${source.type}`, path);
    }
}

function assertAcyclicTheme(graph: ReadonlyMap<string, ReadonlySet<string>>): void {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (token: string, path: readonly string[]): void => {
        if (visiting.has(token)) {
            invalid(`cyclic theme token reference: ${[...path, token].join(" -> ")}`, "$.theme");
        }
        if (visited.has(token)) {
            return;
        }
        visiting.add(token);
        for (const target of graph.get(token) ?? []) {
            visit(target, [...path, token]);
        }
        visiting.delete(token);
        visited.add(token);
    };
    for (const token of graph.keys()) {
        visit(token, []);
    }
}
