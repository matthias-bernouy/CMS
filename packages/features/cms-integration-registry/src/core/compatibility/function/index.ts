import { isDeepStrictEqual } from "node:util";
import type { DeclarativeConnectorFunctionTemplate, DeclarativeConnectorTemplate } from "@bernouy/cms-integrations";
import type { CompatibilityChangeSink } from "../changes";
import { compareHttpContract } from "./http";
import { functionImplementationChanged } from "./implementation";

export function compareConnectorFunctions(
    baseline: DeclarativeConnectorTemplate,
    candidate: DeclarativeConnectorTemplate,
    changedPaths: ReadonlySet<string>,
    path: string,
    add: CompatibilityChangeSink,
): void {
    const previous = new Map((baseline.functions ?? []).map((fn) => [fn.name, fn]));
    const next = new Map((candidate.functions ?? []).map((fn) => [fn.name, fn]));
    for (const [name, fn] of previous) {
        const candidateFunction = next.get(name);
        const functionPath = `${path}.functions.${name}`;
        if (!candidateFunction) {
            add("breaking", "function", "function-removed", functionPath, "Connector function was removed or renamed");
            continue;
        }
        compareFunction(baseline, fn, candidate, candidateFunction, changedPaths, functionPath, add);
    }
    for (const [name] of next) {
        if (!previous.has(name)) {
            add("additive", "function", "function-added", `${path}.functions.${name}`, "Connector function was added");
        }
    }
}

function compareFunction(
    baselineConnector: DeclarativeConnectorTemplate,
    baseline: DeclarativeConnectorFunctionTemplate,
    candidateConnector: DeclarativeConnectorTemplate,
    candidate: DeclarativeConnectorFunctionTemplate,
    changedPaths: ReadonlySet<string>,
    path: string,
    add: CompatibilityChangeSink,
): void {
    const previousContract = baseline.compatibility?.http;
    const nextContract = candidate.compatibility?.http;
    const implementationChanged = functionImplementationChanged(
        baselineConnector,
        baseline,
        candidateConnector,
        candidate,
        changedPaths,
    );
    if (!previousContract || !nextContract) {
        if (implementationChanged || (previousContract && !nextContract)) {
            add(
                "unknown",
                "function",
                "function-contract-unproven",
                path,
                "Changed function lacks comparable HTTP contract metadata",
            );
        } else if (!previousContract && nextContract) {
            add(
                "additive",
                "function",
                "function-contract-declared",
                path,
                "HTTP contract metadata was added without changing implementation",
            );
        }
        return;
    }
    compareHttpContract(previousContract, nextContract, path, add);
    if (implementationChanged && isDeepStrictEqual(previousContract, nextContract)) {
        add(
            "compatible",
            "function",
            "function-implementation-changed",
            path,
            "Function source changed while its declared HTTP contract remained unchanged",
        );
    }
}
