import { composeCollectionThemes } from "cms-content/theme/core/collections";
import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { BlocRecord, TBloc } from "cms-content/blocs/interfaces/blocs";
import { compileCollectionComponent } from "./compiledComponent";

/** Installed resources are projected from their immutable release, never copied into editable bloc storage. */
export function withInstalledCollections(
    repository: CmsRepository,
    store: CollectionStore,
    siteId: string,
): CmsRepository {
    const installed = async (): Promise<BlocRecord[]> => {
        const snapshot = await store.snapshot(siteId);
        return snapshot.collections.flatMap(({ collectionId, release }) =>
            release.blocs.map((bloc) => ({
                tag: bloc.id,
                collectionId,
                ownership: { kind: "code-managed" as const },
                artifact: {
                    id: bloc.id,
                    name: bloc.label,
                    group: release.name,
                    description: bloc.description ?? "",
                    ownership: { kind: "code-managed" },
                    viewJS: bloc.kind === "component" ? (bloc.runtime?.viewJS ?? compileCollectionComponent(bloc)) : "",
                    editorJS: bloc.kind === "component" ? (bloc.runtime?.editorJS ?? "") : "",
                    internal: bloc.internal,
                    ...(bloc.kind === "composition" ? { compositionHTML: bloc.lightdom } : {}),
                    ...(bloc.kind === "component" && bloc.lightdom ? { componentHTML: bloc.lightdom } : {}),
                    ...(bloc.defaultContent ? { defaultContent: bloc.defaultContent } : {}),
                    collectionSlots: bloc.slots,
                    ...(bloc.kind === "component" && bloc.settings ? { collectionSettings: bloc.settings } : {}),
                } as TBloc,
            })),
        );
    };
    const records = async () => {
        const [local, resources] = await Promise.all([repository.getBlocRecords(), installed()]);
        if (resources.some(({ tag }) => local.some((record) => record.tag === tag))) {
            throw new Error("Installed collection collides with a local bloc tag");
        }
        return [...local, ...resources];
    };
    const read = async (tag: string) => (await records()).find((record) => record.tag === tag) ?? null;
    const releases = async () => (await store.snapshot(siteId)).collections.map((item) => item.release);
    const overrides: Partial<CmsRepository> = {
        getSystem: async () => {
            const system = await repository.getSystem();
            return { ...system, theme: composeCollectionThemes(system.theme, await releases()) };
        },
        updateSystem: async (patch) =>
            repository.updateSystem(
                patch.theme ? { ...patch, theme: composeCollectionThemes(patch.theme, await releases()) } : patch,
            ),
        getInstalledCollections: () => store.snapshot(siteId),
        getBlocRecords: records,
        getBlocRecord: read,
        getBlocsList: async (options) => {
            const local = await repository.getBlocsList(options);
            const resources = (await records())
                .filter((record) => record.collectionId)
                .map((record) => record.artifact!);
            return [...local, ...resources.filter((bloc) => !bloc.internal)];
        },
        getBlocsJS: async () => [
            ...(await repository.getBlocsJS()),
            ...(await installed()).map(({ artifact }) => ({
                id: artifact!.id,
                viewJS: artifact!.viewJS,
                editorJS: artifact!.editorJS,
            })),
        ],
        getBlocViewJS: async (tag) => {
            const record = await read(tag);
            return record?.collectionId ? (record.artifact?.viewJS ?? null) : repository.getBlocViewJS(tag);
        },
        getBlocSource: async (tag) => ((await read(tag))?.collectionId ? null : repository.getBlocSource(tag)),
    };
    // Bind original methods to their adapter; prevent all tag-writing paths from claiming installed resources.
    const guarded = new Set([
        "createBloc",
        "replaceBloc",
        "createSiteBloc",
        "saveSiteBlocDraft",
        "publishSiteBloc",
        "archiveSiteBloc",
        "restoreSiteBloc",
    ]);
    return new Proxy(repository, {
        get(target, key) {
            if (key in overrides) {
                return overrides[key as keyof CmsRepository];
            }
            const value = Reflect.get(target, key);
            if (typeof value !== "function") {
                return value;
            }
            if (!guarded.has(String(key))) {
                return value.bind(target);
            }
            return async (...args: unknown[]) => {
                const first = args[0] as { id?: string; tag?: string } | string;
                const tag = typeof first === "string" ? first : (first.tag ?? first.id);
                if ((await installed()).some((record) => record.tag === tag)) {
                    throw Object.assign(new Error("Installed collection blocs are immutable"), { status: 409 });
                }
                return value.apply(target, args);
            };
        },
    });
}
