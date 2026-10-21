import type {
    CollectionTheme,
    CollectionThemeEntry,
    CollectionThemeFontFace,
    CollectionThemeToken,
    CollectionThemeTokenType,
} from "../../interfaces/CollectionTheme";
import type { CollectionDependency } from "../../interfaces/CollectionRelease";
import { invalid } from "../errors";
import type { CollectionLimits } from "../limits";
import { collectionThemeSourceId, collectionThemeTokenId } from "../namespace";
import { array, identifier, integer, keys, record, string, unique } from "../values";
import { parseAssetId } from "./assets";

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
    limits: Readonly<CollectionLimits>,
    dependencies: readonly CollectionDependency[] = [],
): CollectionTheme {
    collectionThemeSourceId(collectionId);
    const source = record(input, "$.theme");
    keys(source, ["label", "categories"], "$.theme");
    let tokenCount = 0;
    const categories = array(source.categories, limits.maxThemeCategories, "$.theme.categories").map((entry, index) => {
        const path = `$.theme.categories[${index}]`;
        const category = record(entry, path);
        keys(category, ["id", "label", "description", "entries"], path);
        const entries = array(category.entries, limits.maxThemeTokens, `${path}.entries`).map((item, offset) =>
            parseThemeEntry(item, collectionId, `${path}.entries[${offset}]`),
        );
        unique(
            entries.map((entry) => entry.id),
            `${path}.entries`,
        );
        tokenCount += entries.length;
        if (tokenCount > limits.maxThemeTokens) {
            invalid(`theme must define at most ${limits.maxThemeTokens} entries`, "$.theme.categories");
        }
        return {
            id: name(category.id, `${path}.id`),
            label: label(category.label, `${path}.label`),
            ...(category.description === undefined
                ? {}
                : { description: string(category.description, 500, `${path}.description`) }),
            entries,
        };
    });
    unique(
        categories.map((category) => category.id),
        "$.theme.categories",
    );
    unique(
        categories.flatMap((category) => category.entries.map((entry) => entry.id)),
        "$.theme.entries",
    );
    const theme = { label: label(source.label, "$.theme.label"), categories };
    validateThemeReferences(theme, collectionId, dependencies);
    return theme;
}

function parseThemeEntry(value: unknown, collectionId: string, path: string): CollectionThemeEntry {
    const source = record(value, path);
    if (source.type === "font-face") {
        keys(source, ["id", "type", "asset", "family", "style", "weight", "display"], path);
        const style = string(source.style, 16, `${path}.style`);
        const display = string(source.display, 16, `${path}.display`);
        const weight = string(source.weight, 16, `${path}.weight`);
        if (!["normal", "italic", "oblique"].includes(style)) {
            invalid("unsupported font style", `${path}.style`);
        }
        if (!["auto", "block", "swap", "fallback", "optional"].includes(display)) {
            invalid("unsupported font display", `${path}.display`);
        }
        if (!validFontWeight(weight)) {
            invalid("must be a font weight from 1 to 1000 or an ascending range", `${path}.weight`);
        }
        return {
            id: name(source.id, `${path}.id`),
            type: "font-face",
            asset: parseAssetId(source.asset, `${path}.asset`),
            family: name(source.family, `${path}.family`),
            style: style as CollectionThemeFontFace["style"],
            weight,
            display: display as CollectionThemeFontFace["display"],
        };
    }
    keys(source, ["id", "generation", "label", "description", "type", "defaults"], path);
    if (!TYPES.has(source.type as CollectionThemeTokenType)) {
        invalid("unsupported theme entry type", `${path}.type`);
    }
    const defaults = record(source.defaults, `${path}.defaults`);
    keys(defaults, ["light", "dark"], `${path}.defaults`);
    const id = name(source.id, `${path}.id`);
    collectionThemeTokenId(collectionId, id);
    return {
        id,
        generation: generation(source.generation, path),
        label: label(source.label, `${path}.label`),
        ...(source.description === undefined
            ? {}
            : { description: string(source.description, 500, `${path}.description`) }),
        type: source.type as CollectionThemeTokenType,
        defaults: {
            light: css(defaults.light, `${path}.defaults.light`),
            ...(defaults.dark === undefined ? {} : { dark: css(defaults.dark, `${path}.defaults.dark`) }),
        },
    };
}

function generation(value: unknown, path: string): number {
    return value === undefined ? 1 : integer(value, 1, Number.MAX_SAFE_INTEGER, `${path}.generation`);
}

function validFontWeight(value: string): boolean {
    const weights = value.split(" ");
    if (weights.length < 1 || weights.length > 2 || weights.some((weight) => !/^\d{1,4}$/u.test(weight))) {
        return false;
    }
    const numbers = weights.map(Number);
    return (
        numbers.every((weight) => weight >= 1 && weight <= 1_000) &&
        (numbers.length === 1 || numbers[0]! <= numbers[1]!)
    );
}

export function isThemeToken(entry: CollectionThemeEntry): entry is CollectionThemeToken {
    return entry.type !== "font-face";
}

function validateThemeReferences(
    theme: CollectionTheme,
    collectionId: string,
    dependencies: readonly CollectionDependency[],
): void {
    const tokens = theme.categories.flatMap((category) => category.entries.filter(isThemeToken));
    const local = new Map(tokens.map((token) => [collectionThemeTokenId(collectionId, token.id), token]));
    const imported = new Set(
        dependencies.flatMap((dependency) =>
            dependency.imports.themeTokens.map(({ id }) => collectionThemeTokenId(dependency.collectionId, id)),
        ),
    );
    const graph = new Map(tokens.map((token) => [token.id, new Set<string>()]));
    for (const [categoryIndex, category] of theme.categories.entries()) {
        for (const [entryIndex, entry] of category.entries.entries()) {
            if (!isThemeToken(entry)) {
                continue;
            }
            for (const mode of ["light", "dark"] as const) {
                const value = entry.defaults[mode];
                if (value === undefined) {
                    continue;
                }
                const path = `$.theme.categories[${categoryIndex}].entries[${entryIndex}].defaults.${mode}`;
                for (const variable of references(value)) {
                    const target = local.get(variable);
                    if (target) {
                        graph.get(entry.id)!.add(target.id);
                        validateReferenceType(entry, target, value, variable, path);
                        continue;
                    }
                    if (imported.has(variable)) {
                        continue;
                    }
                    invalid(`unknown or unimported theme token --${variable}`, path);
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
