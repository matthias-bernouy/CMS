import { ident, lexer, walk } from "css-tree";
import type { Atrule, CssNode } from "css-tree";
import { animationReferences } from "./animationGrammar";

type Replacement = { start: number; end: number; value: string };

/** Rewrite only name tokens, preserving all other authored bytes and historical CSS digests. */
export function compileBlocAnimations(id: string, source: string, ast: CssNode, maximum: number) {
    const names = new Map<string, string>();
    const replacements: Replacement[] = [];
    const fail = (message: string): never => {
        throw new Error(`Bloc ${id} CSS ${message}`);
    };
    const replace = (node: CssNode, value: string) => {
        if (!node.loc) {
            return fail("animation names require source positions");
        }
        replacements.push({
            start: node.loc.start.offset,
            end: node.loc.end.offset,
            value: node.type === "String" ? `"${value}"` : value,
        });
    };
    walk(ast, (node) => {
        if (node.type !== "Atrule" || unprefixed(node.name) !== "keyframes") {
            return;
        }
        const name = keyframesName(node, fail);
        const local = name.type === "Identifier" ? ident.decode(name.name) : name.value;
        // Fixed-width UTF-16 encoding is injective, including quoted names and unusual Unicode.
        const encoded = local
            .split("")
            .map((character) => character.charCodeAt(0).toString(16).padStart(4, "0"))
            .join("");
        const owned = `ulvia-kf-${id.length}-${id}-${encoded}`;
        names.set(local, owned);
        replace(name, owned);
    });
    let hasAnimations = names.size > 0;
    walk(ast, (node) => {
        if (node.type !== "Declaration") {
            return;
        }
        const property = unprefixed(node.property);
        if (property !== "animation" && property !== "animation-name") {
            return;
        }
        hasAnimations = true;
        for (const name of animationReferences(property, node.value, fail)) {
            const local = name.type === "Identifier" ? ident.decode(name.name) : name.value;
            const owned = names.get(local);
            if (!owned) {
                return fail(`${property} references unknown local animation ${JSON.stringify(local)}`);
            }
            replace(name, owned);
        }
    });
    const length = replacements.reduce(
        (total, replacement) => total + replacement.value.length - (replacement.end - replacement.start),
        source.length,
    );
    if (length > maximum) {
        fail("compiled styles exceed the Bloc stylesheet length limit");
    }
    replacements.sort((left, right) => left.start - right.start);
    const fragments: string[] = [];
    let offset = 0;
    for (const replacement of replacements) {
        fragments.push(source.slice(offset, replacement.start), replacement.value);
        offset = replacement.end;
    }
    fragments.push(source.slice(offset));
    return { css: fragments.join(""), hasAnimations };
}

function unprefixed(name: string): string {
    return ident
        .decode(name)
        .toLowerCase()
        .replace(/^-[a-z]+-/u, "");
}

function keyframesName(node: Atrule, fail: (message: string) => never) {
    const prelude = node.prelude;
    if (!node.block || prelude?.type !== "AtrulePrelude" || prelude.children.size !== 1) {
        return fail("@keyframes requires one static local name and a block");
    }
    const name = prelude.children.first!;
    if (name.type !== "Identifier" && name.type !== "String") {
        return fail("@keyframes requires a static local name");
    }
    if (name.type === "Identifier") {
        name.name = ident.encode(ident.decode(name.name));
        if (ident.decode(name.name).toLowerCase() === "none") {
            return fail("@keyframes cannot use the reserved name none without quotes");
        }
    }
    if (lexer.matchType("keyframes-name", prelude).error) {
        return fail("@keyframes requires a valid local name");
    }
    return name;
}
