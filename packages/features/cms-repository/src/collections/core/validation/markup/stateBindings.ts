import { parseHTML } from "linkedom";
import { parseQuery, parseSyncTarget, type CmsSyncTarget } from "@bernouy/cms-content/bindings";
import type { CollectionBloc } from "../../../interfaces/CollectionBloc";
import type { CollectionDependency, CollectionRelease } from "../../../interfaces/CollectionRelease";
import type { CollectionPage } from "../../../interfaces/CollectionPage";
import type { CollectionState } from "../../../interfaces/CollectionState";
import { invalid } from "../../errors";

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
                assertOwnedWrite(target, own, path);
            }
        }
        for (const element of Array.from(document.body.querySelectorAll("[cms-query]"))) {
            const query = parseQuery(element.getAttribute("cms-query") ?? "");
            if (query && "sync" in query) {
                assertReadable(query.sync, own, imported, installed, path);
            }
        }
    }
}

function assertOwnedWrite(target: CmsSyncTarget, own: ReadonlyMap<string, CollectionState>, path: string): void {
    const state = own.get(target.key);
    if (!state) {
        invalid(`cms-sync may write only a state declared by this collection: ${target.key}`, path);
    }
    if (state.scope !== target.scope) {
        invalid(`cms-sync scope must match declared ${state.scope} state ${target.key}`, path);
    }
}

function assertReadable(
    target: CmsSyncTarget,
    own: ReadonlyMap<string, CollectionState>,
    imported: ReadonlyMap<string, { collectionId: string; id: string }>,
    installed: ReadonlyMap<string, CollectionRelease>,
    path: string,
): void {
    const local = own.get(target.key);
    if (local) {
        if (local.scope !== target.scope) {
            invalid(`cms-query scope must match declared ${local.scope} state ${target.key}`, path);
        }
        return;
    }
    const external = imported.get(target.key);
    if (!external) {
        invalid(`cms-query state must be declared locally or explicitly imported: ${target.key}`, path);
    }
    const release = installed.get(external.collectionId);
    if (!release) {
        return;
    }
    const state = release.states?.find(({ id }) => id === external.id);
    if (!state || state.scope !== target.scope) {
        invalid(`imported state ${target.key} does not expose ${target.scope} scope`, path);
    }
}

function collectionMarkups(owner: StateOwner): readonly { html: string; path: string }[] {
    return [
        ...owner.blocs.flatMap((bloc) => [
            ...(bloc.lightdom === undefined ? [] : [{ html: bloc.lightdom, path: `$.blocs[${bloc.id}].lightdom` }]),
            ...(bloc.defaultContent === undefined
                ? []
                : [{ html: bloc.defaultContent, path: `$.blocs[${bloc.id}].defaultContent` }]),
        ]),
        ...(owner.pages?.map((page) => ({ html: page.document.html, path: `$.pages[${page.id}].document.html` })) ??
            []),
    ];
}
