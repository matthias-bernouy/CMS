import type {
    CollectionRelease,
    CollectionResourceDeprecation,
    CollectionResourceKind,
} from "../../../interfaces/CollectionRelease";

export type LifecycleResource = Readonly<{
    kind: CollectionResourceKind | "setting";
    id: string;
    deprecation?: CollectionResourceDeprecation;
}>;
export function collectionLifecycleResources(release: CollectionRelease): readonly LifecycleResource[] {
    const resources: LifecycleResource[] = [];
    for (const bloc of release.blocs) {
        resources.push({ kind: "bloc", id: bloc.id, ...(bloc.deprecation ? { deprecation: bloc.deprecation } : {}) });
        if (bloc.kind === "component") {
            for (const setting of bloc.settings ?? []) {
                resources.push({
                    kind: "setting",
                    id: `${bloc.id}/${setting.id}`,
                    ...(setting.deprecation ? { deprecation: setting.deprecation } : {}),
                });
            }
        }
    }
    for (const category of release.theme?.categories ?? []) {
        for (const token of category.entries) {
            if (token.type !== "font-face") {
                resources.push({
                    kind: "theme-token",
                    id: token.id,
                    ...(token.deprecation ? { deprecation: token.deprecation } : {}),
                });
            }
        }
    }
    for (const [kind, entries] of [
        ["text", release.texts ?? []],
        ["asset", release.assets],
        ["state", release.states ?? []],
    ] as const) {
        for (const entry of entries) {
            resources.push({ kind, id: entry.id, ...(entry.deprecation ? { deprecation: entry.deprecation } : {}) });
        }
    }
    if (release.configuration) {
        resources.push({
            kind: "configuration",
            id: release.collectionId,
            ...(release.configuration.deprecation ? { deprecation: release.configuration.deprecation } : {}),
        });
    }
    return resources;
}
