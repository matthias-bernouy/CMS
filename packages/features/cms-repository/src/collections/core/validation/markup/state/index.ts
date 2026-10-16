import { parseHTML } from "linkedom";
import {
    parseQuery,
    parseQueries,
    parseQueryInput,
    parseQueryListen,
    parseBindingInput,
    parseSyncTarget,
    type CmsBindingInputMap,
    type CmsSyncTarget,
} from "@bernouy/cms-content/bindings";
import type { CollectionBloc } from "../../../../interfaces/CollectionBloc";
import type { CollectionDependency, CollectionRelease } from "../../../../interfaces/CollectionRelease";
import type { CollectionPage } from "../../../../interfaces/CollectionPage";
import type { CollectionState } from "../../../../interfaces/CollectionState";
import { invalid } from "../../../errors";
import { validateDocumentStateCycles } from "./cycles";
import { validateStateInput } from "./input";

type StateOwner = {
    readonly collectionId: string;
    readonly states?: readonly CollectionState[];
    readonly dependencies?: readonly CollectionDependency[];
    readonly blocs: readonly CollectionBloc[];
    readonly pages?: readonly CollectionPage[];
};

export function validateCollectionStateBindings(
    owner: StateOwner,
    installed: ReadonlyMap<string, CollectionRelease> = new Map(),
): void {
    const own = new Map((owner.states ?? []).map((state) => [`${owner.collectionId}-${state.id}`, state]));
    const imported = new Map<string, { collectionId: string; id: string }>();
    for (const dependency of owner.dependencies ?? []) {
        for (const state of dependency.imports.states ?? []) {
            imported.set(`${dependency.collectionId}-${state.id}`, {
                collectionId: dependency.collectionId,
                id: state.id,
            });
        }
    }
    for (const { html, path } of collectionMarkups(owner)) {
        const { document } = parseHTML("<!DOCTYPE html><html><body></body></html>");
        document.body.innerHTML = html;
        for (const element of Array.from(document.body.querySelectorAll("[cms-sync]"))) {
            const target = parseSyncTarget(element.getAttribute("cms-sync"));
            if (target) {
                assertOwnedWrite(target, own, element, path);
            }
        }
        for (const element of Array.from(document.body.querySelectorAll("[cms-query], [cms-queries]"))) {
            const query = parseQuery(element.getAttribute("cms-query") ?? "");
            if (query && "sync" in query) {
                assertReadable(query.sync, own, imported, installed, path);
            }
            validateInputReads(
                parseQueryInput(element.getAttribute("cms-query-input")),
                own,
                imported,
                installed,
                path,
            );
            for (const listener of parseQueryListen(element.getAttribute("cms-query-listen")) ?? []) {
                const state = assertReadable(listener.sync, own, imported, installed, path);
                if (state) {
                    validateStateSelection(listener.path, state, path);
                }
            }
            for (const binding of parseQueries(element.getAttribute("cms-queries")) ?? []) {
                assertReadable(binding.sync, own, imported, installed, path);
            }
        }
        for (const element of Array.from(document.body.querySelectorAll("[cms-mutation-input]"))) {
            validateInputReads(
                parseBindingInput(element.getAttribute("cms-mutation-input")),
                own,
                imported,
                installed,
                path,
            );
        }
        validateDocumentStateCycles(document, path);
    }
}

function validateStateSelection(selection: readonly string[], state: CollectionState, path: string): void {
    let schema = state.schema;
    for (const segment of selection) {
        if (schema.type === "object") {
            const property = schema.properties[segment];
            if (!property) {
                invalid(`cms-query-listen references unknown state property ${JSON.stringify(segment)}`, path);
            }
            schema = property;
            continue;
        }
        if (schema.type === "map") {
            schema = schema.values;
            continue;
        }
        if (schema.type === "array" && /^(?:0|[1-9]\d*)$/u.test(segment)) {
            schema = schema.items;
            continue;
        }
        invalid(`cms-query-listen path segment ${JSON.stringify(segment)} cannot select from ${schema.type}`, path);
    }
}

function validateInputReads(
    input: CmsBindingInputMap | null,
    own: ReadonlyMap<string, CollectionState>,
    imported: ReadonlyMap<string, { collectionId: string; id: string }>,
    installed: ReadonlyMap<string, CollectionRelease>,
    path: string,
): void {
    for (const source of Object.values(input ?? {})) {
        if (source?.from === "state") {
            const target = parseSyncTarget(source.key);
            if (target) {
                const state = assertReadable(target, own, imported, installed, path);
                if (state) {
                    validateStateInput(source, state, path);
                }
            }
        }
    }
}

function assertOwnedWrite(
    target: CmsSyncTarget,
    own: ReadonlyMap<string, CollectionState>,
    element: Element,
    path: string,
): void {
    const state = own.get(target.key);
    if (!state) {
        invalid(`cms-sync may write only a state declared by this collection: ${target.key}`, path);
    }
    if (state.scope !== target.scope) {
        invalid(`cms-sync scope must match declared ${state.scope} state ${target.key}`, path);
    }
    const producerType = synchronizedProducerType(element, target.scope);
    if (
        producerType &&
        (state.schema.type !== producerType || ("nullable" in state.schema && state.schema.nullable === true))
    ) {
        invalid(`cms-sync producer requires a nonnullable ${producerType} state: ${target.key}`, path);
    }
}

function synchronizedProducerType(
    element: Element,
    scope: CmsSyncTarget["scope"],
): "boolean" | "object" | "string" | null {
    if (scope === "param") {
        return "string";
    }
    if (element.hasAttribute("cms-query") || element.localName === "form") {
        return "object";
    }
    if (element.localName === "input" && element.getAttribute("type")?.toLowerCase() === "checkbox") {
        return "boolean";
    }
    if (["input", "select", "textarea"].includes(element.localName)) {
        return "string";
    }
    return null;
}

function assertReadable(
    target: CmsSyncTarget,
    own: ReadonlyMap<string, CollectionState>,
    imported: ReadonlyMap<string, { collectionId: string; id: string }>,
    installed: ReadonlyMap<string, CollectionRelease>,
    path: string,
): CollectionState | undefined {
    const local = own.get(target.key);
    if (local) {
        if (local.scope !== target.scope) {
            invalid(`cms-query scope must match declared ${local.scope} state ${target.key}`, path);
        }
        return local;
    }
    const external = imported.get(target.key);
    if (!external) {
        invalid(`cms-query state must be declared locally or explicitly imported: ${target.key}`, path);
    }
    const release = installed.get(external.collectionId);
    if (!release) {
        return undefined;
    }
    const state = release.states?.find(({ id }) => id === external.id);
    if (!state || state.scope !== target.scope) {
        invalid(`imported state ${target.key} does not expose ${target.scope} scope`, path);
    }
    return state;
}

function collectionMarkups(owner: StateOwner): readonly { html: string; path: string }[] {
    return [
        ...owner.blocs.flatMap((bloc) => [
            {
                html: bloc.kind === "component" ? bloc.template : bloc.lightdom,
                path: `$.blocs[${bloc.id}].${bloc.kind === "component" ? "template" : "lightdom"}`,
            },
            ...(bloc.defaultContent === undefined
                ? []
                : [{ html: bloc.defaultContent, path: `$.blocs[${bloc.id}].defaultContent` }]),
        ]),
        ...(owner.pages?.map((page) => ({ html: page.document.html, path: `$.pages[${page.id}].document.html` })) ??
            []),
    ];
}
