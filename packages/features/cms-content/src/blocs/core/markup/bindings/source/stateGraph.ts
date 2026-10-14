import { parseSyncTarget } from "cms-content/blocs/core/markup/bindings/sync";
import { parseQuery, parseQueryListen } from "./index";

/** Rejects automatic query feedback and competing producers in one composed document. */
export function validateStateQueryGraph(root: ParentNode): void {
    const graph = new Map<string, Set<string>>();
    const producers = new Set<string>();
    for (const element of Array.from(root.querySelectorAll("[cms-query][cms-sync]"))) {
        const query = parseQuery(element.getAttribute("cms-query") ?? "");
        const output = parseSyncTarget(element.getAttribute("cms-sync"));
        if (!query || !output) {
            continue;
        }
        const outputId = stateId(output.scope, output.key);
        if (producers.has(outputId)) {
            throw new TypeError(`state ${output.key} has multiple automatic query producers in one document`);
        }
        producers.add(outputId);
        for (const inputId of queryInputs(element, query)) {
            const outputs = graph.get(inputId) ?? new Set<string>();
            outputs.add(outputId);
            graph.set(inputId, outputs);
        }
    }
    assertAcyclic(graph);
}

function queryInputs(element: Element, query: ReturnType<typeof parseQuery>): ReadonlySet<string> {
    const inputs = new Set<string>();
    if (query && "sync" in query) {
        inputs.add(stateId(query.sync.scope, query.sync.key));
    }
    for (const target of parseQueryListen(element.getAttribute("cms-query-listen")) ?? []) {
        inputs.add(stateId(target.scope, target.key));
    }
    return inputs;
}

function assertAcyclic(graph: ReadonlyMap<string, ReadonlySet<string>>): void {
    const active = new Set<string>();
    const visited = new Set<string>();
    const visit = (node: string, trail: readonly string[]): void => {
        if (active.has(node)) {
            const start = trail.indexOf(node);
            const cycle = [...trail.slice(start), node].map(displayStateId).join(" -> ");
            throw new TypeError(`automatic state query cycle: ${cycle}`);
        }
        if (visited.has(node)) {
            return;
        }
        active.add(node);
        for (const next of graph.get(node) ?? []) {
            visit(next, [...trail, node]);
        }
        active.delete(node);
        visited.add(node);
    };
    for (const node of graph.keys()) {
        visit(node, []);
    }
}

function stateId(scope: string, key: string): string {
    return `${scope}\0${key}`;
}

function displayStateId(id: string): string {
    const [scope, key] = id.split("\0");
    return `@${scope}:${key}`;
}
