import { blocStylePaintProperty } from "@bernouy/cms-content/page-document";
import { generate, ident, lexer, walk } from "css-tree";
import type { CssNode, Declaration } from "css-tree";
import { invalid } from "../../errors";

const COLOR_FUNCTIONS = new Set([
    "rgb",
    "rgba",
    "hsl",
    "hsla",
    "hwb",
    "lab",
    "lch",
    "oklab",
    "oklch",
    "color",
    "device-cmyk",
]);
const COLOR_KEYWORDS = new Set(["transparent", "currentcolor"]);

export function cssReferences(value: CssNode): ReadonlySet<string> {
    const result = new Set<string>();
    walk(value, (node) => {
        if (node.type === "Function" && ident.decode(node.name).toLowerCase() === "var") {
            const name = node.children.first;
            if (name?.type === "Identifier" && name.name.startsWith("--")) {
                result.add(ident.decode(name.name).slice(2));
            }
        }
    });
    return result;
}

export function assertTokenColors(declaration: Declaration, path: string): void {
    walk(declaration.value, (node) => {
        if (node.type === "Function" || node.type === "Identifier") {
            node.name = ident.decode(node.name);
        }
        const literal =
            node.type === "Hash" ||
            (node.type === "Function" &&
                COLOR_FUNCTIONS.has(node.name.toLowerCase()) &&
                !(node.children.first?.type === "Identifier" && node.children.first.name.toLowerCase() === "from")) ||
            (node.type === "Identifier" &&
                !COLOR_KEYWORDS.has(node.name.toLowerCase()) &&
                lexer.matchType("color", node).error === null);
        if (literal || node.type === "Raw" || (node.type === "Function" && node.name.toLowerCase() === "attr")) {
            invalid(
                `${declaration.property}: ${generate(declaration.value)} contains a raw or unverified color (${generate(node)}); use a declared/imported theme token, optionally with color-mix()`,
                path,
            );
        }
    });
}

/** Resolve the collection-wide local alias graph once, including all selector variants. */
export function colorVariables(
    declarations: readonly Readonly<{ declaration: Declaration; path: string }>[],
    theme: ReadonlySet<string>,
): ReadonlySet<string> {
    const aliases = new Map<string, (typeof declarations)[number][]>();
    const reached = new Set<string>();
    const graph = new Map<string, Set<string>>();
    for (const entry of declarations) {
        const { declaration, path } = entry;
        if (declaration.property.startsWith("--")) {
            assertTokenColors(declaration, path);
            const name = declaration.property.slice(2);
            const values = aliases.get(name) ?? [];
            values.push(entry);
            aliases.set(name, values);
        } else if (blocStylePaintProperty(declaration.property.toLowerCase())) {
            assertTokenColors(declaration, path);
            for (const name of cssReferences(declaration.value)) {
                reached.add(name);
            }
        }
    }
    // Set iteration visits newly added aliases without recursion or repeated expansion.
    for (const name of reached) {
        if (theme.has(name)) {
            continue;
        }
        for (const { declaration, path } of aliases.get(name) ?? []) {
            assertTokenColors(declaration, path);
            for (const dependency of cssReferences(declaration.value)) {
                reached.add(dependency);
                if (!theme.has(dependency)) {
                    const edges = graph.get(name) ?? new Set<string>();
                    edges.add(dependency);
                    graph.set(name, edges);
                }
            }
        }
    }
    assertAcyclic(graph, aliases);
    return reached;
}

function assertAcyclic(
    graph: ReadonlyMap<string, ReadonlySet<string>>,
    aliases: ReadonlyMap<string, readonly Readonly<{ path: string }>[]>,
): void {
    const counts = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const [name, edges] of graph) {
        counts.set(name, edges.size);
        for (const dependency of edges) {
            if (!counts.has(dependency)) {
                counts.set(dependency, 0);
            }
            const entries = dependents.get(dependency) ?? [];
            entries.push(name);
            dependents.set(dependency, entries);
        }
    }
    const ready = [...counts].filter(([, count]) => count === 0).map(([name]) => name);
    for (let index = 0; index < ready.length; index++) {
        for (const name of dependents.get(ready[index]!) ?? []) {
            const count = counts.get(name)! - 1;
            counts.set(name, count);
            if (count === 0) {
                ready.push(name);
            }
        }
    }
    const cycle = [...counts].find(([, count]) => count > 0)?.[0];
    if (cycle) {
        invalid(`cyclic UI color alias --${cycle}; resolve aliases to theme tokens`, aliases.get(cycle)![0]!.path);
    }
}
