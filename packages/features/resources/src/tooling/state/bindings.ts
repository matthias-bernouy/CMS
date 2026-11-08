import { parseHTML } from "linkedom";
import { resourceRuntimeNamespace } from "@bernouy/ulvia-contracts/protocol";
import { firstSchemaSubsetViolation } from "@bernouy/ulvia-contracts/compatibility";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import {
    parseSyncTarget,
    parseQuery,
    parseQueries,
    parseQueryInput,
    parseBindingInput,
    parseQueryListen,
    validateStateQueryGraph,
} from "@bernouy/content/bindings";
import { validateDocumentBindings, resolveSyncProducerSchemas } from "@bernouy/content/page-document";
import type { BindingCapability } from "@bernouy/content/page-document";
import type { PreparedResourceSource, ResourceBrowserState } from "../interfaces";
import { validateStateInput } from "./input";
import { invalid } from "./schemas";

/** Build-only browser-state authority. Ordinary sources compose explicitly without an installed dependency graph. */
export function validateSourceBindings(
    source: PreparedResourceSource,
    all: readonly PreparedResourceSource[],
    capabilities: readonly BindingCapability[],
): void {
    const stateMap = new Map<string, ResourceBrowserState & { readonly owner: string }>(
        all.flatMap((owner) =>
            owner.states.map(
                (state) =>
                    [
                        `${resourceRuntimeNamespace(owner.namespace)}--${state.id}`,
                        { ...state, owner: owner.namespace },
                    ] as const,
            ),
        ),
    );
    const documents = [
        ...source.blocs.flatMap((bloc) => [
            { path: `blocs/${bloc.id}/markup.html`, html: bloc.markupHTML },
            ...(bloc.initialDocument
                ? [{ path: `blocs/${bloc.id}/initial.html`, html: bloc.initialDocument.html }]
                : []),
        ]),
        ...source.pages.map((page) => ({ path: page.path, html: page.html })),
        ...source.examples,
    ];
    for (const { path, html } of documents) {
        const { document } = parseHTML("<!doctype html><html><body></body></html>");
        document.body.innerHTML = html;
        validateDocumentBindings(document, { capabilities, requireCapabilityResolution: true });
        validateStateQueryGraph(document.body);
        const read = (target: ReturnType<typeof parseSyncTarget>) => {
            if (!target) {
                return undefined;
            }
            const state = stateMap.get(target.key);
            if (!state || state.scope !== target.scope) {
                invalid("Unknown state or incorrect scope: " + target.key, path);
            }
            return state;
        };
        for (const element of Array.from(document.querySelectorAll("[cms-sync]"))) {
            const target = parseSyncTarget(element.getAttribute("cms-sync"));
            const state = read(target);
            if (!state || !target || state.owner !== source.namespace) {
                invalid("A source may write only its own declared state", path);
            }
            const type =
                target.scope === "param"
                    ? "string"
                    : element.hasAttribute("cms-query") || element.localName === "form"
                      ? "object"
                      : element.localName === "input" && element.getAttribute("type")?.toLowerCase() === "checkbox"
                        ? "boolean"
                        : ["input", "select", "textarea"].includes(element.localName)
                          ? "string"
                          : null;
            if (type && (state.schema.type !== type || ("nullable" in state.schema && state.schema.nullable))) {
                invalid("State producer type/scope mismatch", path);
            }
            if (element.hasAttribute("cms-query") || element.localName === "form") {
                for (const produced of resolveSyncProducerSchemas(element, capabilities, true)) {
                    const violation = firstSchemaSubsetViolation(produced as UlviaSchema, state.schema, "$.schema");
                    if (violation) {
                        invalid(
                            "cms-sync producer is incompatible with state " + target.key + " at " + violation,
                            path,
                        );
                    }
                }
            }
        }
        for (const element of Array.from(
            document.querySelectorAll("[cms-query], [cms-queries], [cms-mutation-input]"),
        )) {
            const query = parseQuery(element.getAttribute("cms-query") ?? "");
            if (query && "sync" in query) {
                read(query.sync);
            }
            for (const binding of parseQueries(element.getAttribute("cms-queries")) ?? []) {
                read(binding.sync);
            }
            for (const listener of parseQueryListen(element.getAttribute("cms-query-listen")) ?? []) {
                const state = read(listener.sync);
                if (state) {
                    selectState(state, listener.path, path);
                }
            }
            for (const input of [
                parseQueryInput(element.getAttribute("cms-query-input")),
                parseBindingInput(element.getAttribute("cms-mutation-input")),
            ]) {
                for (const value of Object.values(input ?? {})) {
                    if (value?.from === "state") {
                        const state = read(parseSyncTarget(value.key));
                        if (state) {
                            validateStateInput(value, state, path);
                        }
                    }
                }
            }
        }
    }
}
function selectState(state: ResourceBrowserState, selection: readonly string[], path: string): void {
    let schema = state.schema;
    for (const segment of selection) {
        if (schema.type === "object" && schema.properties[segment]) {
            schema = schema.properties[segment];
        } else if (schema.type === "map") {
            schema = schema.values;
        } else if (schema.type === "array" && /^(?:0|[1-9]\d*)$/u.test(segment)) {
            schema = schema.items;
        } else {
            invalid("Unknown state selection: " + segment, path);
        }
    }
}
