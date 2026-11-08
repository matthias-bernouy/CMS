import { resourceRuntimeNamespace } from "@bernouy/ulvia-contracts/protocol";
import { parseHTML } from "linkedom";
import { collectCmsMutationBindings, collectCmsQueryBindings } from "@bernouy/content";
import type { CollectionRelease } from "../../../interfaces/CollectionRelease";
import type { UsageReference } from "./interfaces";
import {
    replaceCollectionTextExpressions,
    replaceCollectionAssetExpressions,
} from "repository/collections/core/texts/expressions";

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
            .find(({ collectionId }) => match[1]!.startsWith(`${resourceRuntimeNamespace(collectionId)}--`));
        if (owner) {
            add(
                "theme-token",
                owner.collectionId,
                match[1]!.slice(resourceRuntimeNamespace(owner.collectionId).length + 2),
            );
        }
    }
    for (const release of releases) {
        for (const state of release.states ?? []) {
            const key = `${resourceRuntimeNamespace(release.collectionId)}--${state.id}`;
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
            const separator = suffix.indexOf("/", suffix.indexOf("/") + 1);
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

/** Reuse immutable markup evidence only within one inventory, preserving every use's location. */
export function documentUsageScanner(
    releases: readonly CollectionRelease[],
    maxEntries = 128,
    maxBytes = 8 * 1024 * 1024,
) {
    if ([maxEntries, maxBytes].some((value) => !Number.isSafeInteger(value) || value < 1)) {
        throw new TypeError("Invalid document scan cache limits");
    }
    const entries = new Map<string, { references: UsageReference[]; ids: readonly string[]; bytes: number }>();
    let bytes = 0;
    return {
        get size() {
            return entries.size;
        },
        get retainedBytes() {
            return bytes;
        },
        read(html: string, location: string) {
            let entry = entries.get(html);
            if (entry) {
                entries.delete(html);
                entries.set(html, entry);
            } else {
                const references = documentReferences(html, "", "runtime", releases);
                const ids = documentBlocIds(html);
                entry = {
                    references,
                    ids,
                    bytes: html.length * 2 + JSON.stringify({ references, ids }).length * 2 + 128,
                };
                if (entry.bytes <= maxBytes) {
                    while (entries.size && (entries.size >= maxEntries || bytes + entry.bytes > maxBytes)) {
                        const oldest = entries.keys().next().value!;
                        bytes -= entries.get(oldest)!.bytes;
                        entries.delete(oldest);
                    }
                    entries.set(html, entry);
                    bytes += entry.bytes;
                }
            }
            return {
                references: entry.references.map((reference) => ({ ...reference, location })),
                ids: [...entry.ids],
            };
        },
    };
}
