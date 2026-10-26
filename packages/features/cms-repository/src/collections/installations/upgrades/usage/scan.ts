import { parseHTML } from "linkedom";
import { collectCmsMutationBindings, collectCmsQueryBindings } from "@bernouy/cms-content";
import type { CollectionRelease } from "../../../interfaces/CollectionRelease";
import type { UsageReference } from "./interfaces";
import { replaceCollectionTextExpressions, replaceCollectionAssetExpressions } from "../../../core/texts/expressions";

/** Collect declared identities, retaining every diagnostic location. Never execute authored source. */
export function documentReferences(
    html: string,
    location: string,
    scope: "catalogue" | "runtime",
    releases: readonly CollectionRelease[],
): UsageReference[] {
    const references: UsageReference[] = [];
    const owners = new Map(
        releases.flatMap((release) => release.blocs.map((bloc) => [bloc.id, release.collectionId] as const)),
    );
    const add = (
        kind: "bloc" | "setting" | "theme-token" | "text" | "asset" | "state",
        collectionId: string,
        id: string,
    ) => {
        references.push({ type: "resource", kind, collectionId, id, location, scope });
    };
    replaceCollectionTextExpressions(html, (owner, id) => {
        add("text", owner, id);
        return "";
    });
    replaceCollectionAssetExpressions(html, (owner, id) => {
        add("asset", owner, id);
        return "";
    });
    for (const match of html.matchAll(/var\(\s*--([a-z][a-z0-9-]*)/giu)) {
        const owner = [...releases]
            .sort((a, b) => b.collectionId.length - a.collectionId.length)
            .find(({ collectionId }) => match[1]!.startsWith(`${collectionId}-`));
        if (owner) {
            add("theme-token", owner.collectionId, match[1]!.slice(owner.collectionId.length + 1));
        }
    }
    for (const release of releases) {
        for (const state of release.states ?? []) {
            const key = `${release.collectionId}-${state.id}`;
            if (new RegExp(`(?<![a-z0-9-])${key}(?![a-z0-9-])`, "u").test(html)) {
                add("state", release.collectionId, state.id);
            }
        }
    }
    const { document } = parseHTML(`<html><body>${html}</body></html>`);
    for (const element of Array.from(document.body.querySelectorAll("[cms-bloc]"))) {
        const id = element.getAttribute("cms-bloc")!;
        const owner = owners.get(id);
        if (owner) {
            add("bloc", owner, id);
            const bloc = releases.flatMap((release) => release.blocs).find((bloc) => bloc.id === id)!;
            if (bloc.kind === "component") {
                for (const setting of bloc.settings ?? []) {
                    if (element.hasAttribute(setting.id)) {
                        add("setting", owner, `${id}/${setting.id}`);
                    }
                }
            }
        }
    }
    const calls = [...collectCmsQueryBindings(html), ...collectCmsMutationBindings(html)];
    for (const element of Array.from(document.body.querySelectorAll("svg[cms-svg], img[src], source[src], a[href]"))) {
        const value =
            element.getAttribute("cms-svg") ?? element.getAttribute("src") ?? element.getAttribute("href") ?? "";
        const marker = "/.cms/call/";
        const path = value.split(/[?#]/)[0]!;
        const offset = path.indexOf(marker);
        if (offset >= 0 && path.startsWith("/") && !path.startsWith("//")) {
            const suffix = path.slice(offset + marker.length);
            const separator = suffix.indexOf("/");
            if (separator > 0) {
                references.push({
                    type: "binding",
                    contractId: suffix.slice(0, separator),
                    bindingPath: suffix.slice(separator),
                    location,
                    scope,
                });
            }
        }
    }
    for (const call of calls) {
        references.push({
            type: "capability",
            contractId: call.contractId,
            capabilityId: call.capabilityId,
            location,
            scope,
        });
    }
    return references;
}

export function documentBlocIds(html: string): readonly string[] {
    const { document } = parseHTML(`<html><body>${html}</body></html>`);
    return [
        ...new Set(
            Array.from(document.body.querySelectorAll("[cms-bloc]")).map(
                (element) => element.getAttribute("cms-bloc")!,
            ),
        ),
    ];
}
