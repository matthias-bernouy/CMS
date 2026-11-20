import { ident, lexer, List, walk } from "css-tree";
import type { CssNode, SyntaxMatchNode } from "css-tree";

type Name = Extract<CssNode, { type: "Identifier" | "String" }>;
const CSS_WIDE = new Set(["initial", "inherit", "unset", "revert", "revert-layer"]);

/** Match top-level list entries individually to stay within the lexer's fixed iteration budget. */
export function animationReferences(property: string, value: CssNode, fail: (message: string) => never): Name[] {
    const invalid = (): never => fail(`has invalid ${property}: expected static local animation names`);
    if (value.type !== "Value") {
        return invalid();
    }
    walk(value, (node) => {
        if (node.type === "Identifier" || node.type === "Function") {
            node.name = ident.encode(ident.decode(node.name));
        }
        if (node.type === "Function" && ["var", "env", "attr"].includes(ident.decode(node.name).toLowerCase())) {
            fail(
                `${property} requires static animation names; use separate animation parameter properties for dynamic values`,
            );
        }
    });
    const groups: CssNode[][] = [[]];
    for (const node of value.children) {
        if (node.type === "Operator" && node.value === ",") {
            groups.push([]);
        } else {
            groups.at(-1)!.push(node);
        }
    }
    const result: Name[] = [];
    for (const group of groups) {
        if (
            groups.length > 1 &&
            group.some((node) => node.type === "Identifier" && CSS_WIDE.has(node.name.toLowerCase()))
        ) {
            return invalid();
        }
        const match = lexer.matchProperty(property, { type: "Value", children: new List<CssNode>().fromArray(group) });
        if (match.error || !match.matched) {
            return invalid();
        }
        result.push(...matchedNames(match.matched));
    }
    return result;
}

/** Walk each grammar match once, rather than rescanning it for every identifier. */
function matchedNames(match: SyntaxMatchNode): Name[] {
    const result: Name[] = [];
    const pending = [{ match, isName: false }];
    for (let index = 0; index < pending.length; index++) {
        const { match: current, isName } = pending[index]!;
        const withinName = isName || (current.syntax?.type === "Type" && current.syntax.name === "keyframes-name");
        if (withinName && (current.node?.type === "Identifier" || current.node?.type === "String")) {
            result.push(current.node);
        }
        for (const child of current.match ?? []) {
            pending.push({ match: child, isName: withinName });
        }
    }
    return result;
}
