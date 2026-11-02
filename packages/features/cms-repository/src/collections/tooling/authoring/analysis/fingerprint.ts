import { parseHTML } from "linkedom";
import { parse, generate, walk } from "css-tree";
import type { CssNode, Value } from "css-tree";
import { createHash } from "node:crypto";
import type { CollectionBloc } from "cms-repository/collections/interfaces/CollectionBloc";

/** Candidate fingerprints preserve values, CSS order/media, native contracts and executable behavior. */
export function blocDesignFingerprint(bloc: CollectionBloc) {
    if (bloc.kind === "component" && bloc.runtime?.viewJS) {
        return undefined;
    }
    const { document } = parseHTML("<!doctype html><html><body></body></html>");
    document.body.innerHTML = bloc.markup;
    const ast = parse(bloc.kind === "component" ? (bloc.style ?? "") : "");
    const css = generate(ast);
    const slots = new Map<string, string>();
    for (const element of Array.from(document.body.querySelectorAll("slot[name]"))) {
        const name = element.getAttribute("name")!;
        if (!slots.has(name)) {
            slots.set(name, css.includes(name) ? name : `slot-${slots.size}`);
        }
        element.setAttribute("name", slots.get(name)!);
    }
    const contract = {
        kind: bloc.kind,
        root: bloc.root,
        slots: Object.fromEntries(Object.entries(bloc.slots).map(([name, value]) => [slots.get(name) ?? name, value])),
        settings: bloc.kind === "component" ? (bloc.settings ?? []) : [],
        uses: bloc.uses,
        requires: bloc.requires,
        browser: bloc.browser ?? null,
    };
    const markup = nodeShape(document.body);
    const features = new Map<string, number>();
    const context: string[] = [];
    walk(ast, {
        enter(node: CssNode) {
            if (node.type === "Rule" || node.type === "Atrule") {
                context.push(
                    node.type === "Rule"
                        ? generate(node.prelude)
                        : `@${node.name}:${node.prelude ? generate(node.prelude) : ""}`,
                );
            }
            if (node.type === "Declaration") {
                const feature = `${context.join("/")}|${node.property}:${generate(node.value)}:${node.important}`;
                features.set(feature, (features.get(feature) ?? 0) + 1);
                node.value = parse("0", { context: "value" }) as Value;
            }
        },
        leave(node: CssNode) {
            if (node.type === "Rule" || node.type === "Atrule") {
                context.pop();
            }
        },
    });
    const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
    return {
        fingerprint: hash({ contract, markup, css }),
        structure: hash({ contract, markup, stylesheet: generate(ast) }),
        features,
        id: bloc.id,
    };
}

function nodeShape(node: Node): unknown {
    if (node.nodeType === 3) {
        return node.textContent;
    }
    if (node.nodeType !== 1) {
        return null;
    }
    const element = node as Element;
    return [
        element.localName,
        Object.fromEntries(Array.from(element.attributes, (attribute) => [attribute.name, attribute.value])),
        Array.from(element.childNodes, nodeShape),
    ];
}

function canonical(value: unknown): string {
    return JSON.stringify(value, (_key, item) =>
        item && typeof item === "object" && !Array.isArray(item)
            ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
            : item,
    );
}
