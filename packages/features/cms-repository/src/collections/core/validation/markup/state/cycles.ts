import { parseQuery, parseQueryInput, parseSyncTarget } from "@bernouy/cms-content/bindings";
import { invalid } from "../../../errors";

/** Rejects automatic feedback loops inside one authored Light DOM document. */
export function validateDocumentStateCycles(document: Document, path: string): void {
    const graph = new Map<string, Set<string>>();
    const producers = new Set<string>();
    for (const element of Array.from(document.body.querySelectorAll("[cms-query][cms-sync]"))) {
        const query = parseQuery(element.getAttribute("cms-query") ?? "");
        const output = parseSyncTarget(element.getAttribute("cms-sync"));
        if (!query || !output) {
            continue;
        }
        const outputId = stateId(output.scope, output.key);
        if (producers.has(outputId)) {
            invalid(`state ${output.key} has multiple automatic query producers in one document`, path);
        }
        producers.add(outputId);
        for (const inputId of queryInputs(element, query)) {
            const outputs = graph.get(inputId) ?? new Set<string>();
            outputs.add(outputId);
            graph.set(inputId, outputs);
        }
    }
    assertAcyclic(graph, path);
}

function queryInputs(element: Element, query: ReturnType<typeof parseQuery>): ReadonlySet<string> {
    const inputs = new Set<string>();
    if (query && "sync" in query) {
        inputs.add(stateId(query.sync.scope, query.sync.key));
    }
    for (const source of Object.values(parseQueryInput(element.getAttribute("cms-query-input")) ?? {})) {
        if (source?.from !== "state") {
            continue;
        }
        const target = parseSyncTarget(source.key);
        if (target) {
            inputs.add(stateId(target.scope, target.key));
        }
    }
    return inputs;
}

function assertAcyclic(graph: ReadonlyMap<string, ReadonlySet<string>>, path: string): void {
    const active = new Set<string>();
    const visited = new Set<string>();
    const visit = (node: string, trail: readonly string[]): void => {
        if (active.has(node)) {
            const start = trail.indexOf(node);
            const cycle = [...trail.slice(start), node].map(displayStateId).join(" -> ");
            invalid(`automatic state query cycle: ${cycle}`, path);
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
