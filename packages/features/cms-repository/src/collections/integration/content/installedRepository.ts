import { collectionExampleDocument } from "../../core/validation/examples/document";
import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import {
    type CollectionComponentSettings,
    type CollectionRelease,
    type CollectionSettingControl,
    type CollectionSettingItem,
    pageRequirements,
    resolveCollectionTranslation,
} from "@bernouy/cms-repository/collections";
import {
    type BlocRecord,
    type CmsRepository,
    createBlocUsageResolver,
    type PageRouteRegistry,
    type RenderablePage,
    validateBlocWrite,
} from "@bernouy/cms-content";
import { createInstalledSnapshotReader } from "./installedSnapshot";
import { composeCollectionThemes } from "./theme";
import { projectCollectionTextSource } from "./texts";

type CmsRepositoryMethod = {
    [Key in keyof CmsRepository]-?: NonNullable<CmsRepository[Key]> extends (...args: never[]) => unknown ? Key : never;
}[keyof CmsRepository];

type CmsRepositoryMethodPolicy = "delegate" | "guard-bloc" | "override";

const CMS_REPOSITORY_METHOD_POLICY = {
    getContentContributions: "override",
    getPageRequirements: "override",
    getSiteBlocGroups: "delegate",
    updateSiteBlocGroup: "delegate",
    createSiteBlocGroup: "delegate",
    createBloc: "guard-bloc",
    replaceBloc: "guard-bloc",
    getBlocRecord: "override",
    getBlocRecords: "override",
    createSiteBloc: "guard-bloc",
    saveSiteBlocDraft: "guard-bloc",
    publishSiteBloc: "guard-bloc",
    archiveSiteBloc: "guard-bloc",
    restoreSiteBloc: "guard-bloc",
    withSiteBlocPublicationLock: "delegate",
    getBlocsList: "override",
    getBlocViewJS: "override",
    getBlocViewsJS: "override",
    getSiteBlocsRevision: "delegate",
    getBlocSource: "override",
    getPage: "delegate",
    getPageById: "delegate",
    getAllPages: "delegate",
    scanPages: "delegate",
    scanPagesByContentReference: "delegate",
    getPublishedPage: "delegate",
    getPublishedPageById: "delegate",
    getPublishedPagesByIds: "delegate",
    getPublishedPages: "delegate",
    getPageRoute: "delegate",
    getPageRoutes: "delegate",
    insertPage: "delegate",
    updatePage: "delegate",
    deletePage: "delegate",
    setPagePaths: "delegate",
    deletePageWithAlternative: "delegate",
    getLinks: "delegate",
    getPagesMetadata: "delegate",
    getTagCounts: "delegate",
    getSystem: "override",
    getSystemRevision: "delegate",
    updateSystem: "override",
} as const satisfies Record<CmsRepositoryMethod, CmsRepositoryMethodPolicy>;

/** Installed resources are projected from their immutable release, never copied into editable bloc storage. */
export function withInstalledCollections(
    repository: CmsRepository,
    store: CollectionStore,
    siteId: string,
    routes?: PageRouteRegistry,
): CmsRepository {
    type InstalledState = {
        revision: number;
        collections: Awaited<ReturnType<CollectionStore["snapshot"]>>["collections"];
        records: BlocRecord[];
        byTag: Map<string, BlocRecord>;
    };
    let cache: InstalledState | undefined;
    let pending: Promise<InstalledState> | undefined;
    const installedSnapshot = createInstalledSnapshotReader(store, siteId);
    const installedState = async (): Promise<InstalledState> => {
        const revision = await store.revision(siteId);
        if (cache?.revision === revision) {
            return cache;
        }
        if (pending) {
            const loaded = await pending;
            if (loaded.revision === revision) {
                return loaded;
            }
        }
        pending = loadInstalledState();
        try {
            cache = await pending;
            return cache;
        } finally {
            pending = undefined;
        }
    };
    const loadInstalledState = async (): Promise<InstalledState> => {
        const snapshot = await installedSnapshot();
        const collections = await Promise.all(
            snapshot.collections.map(async ({ collectionId, release }) =>
                Promise.all(
                    release.blocs.map(async (bloc) => {
                        const artifact = validateBlocWrite({
                            id: bloc.id,
                            name: resolveCollectionTranslation(release, bloc.label),
                            group: resolveCollectionTranslation(release, bloc.categories[0]!),
                            ...(bloc.categories
                                ? {
                                      categories: [
                                          ...new Set(
                                              bloc.categories.map((key) => resolveCollectionTranslation(release, key)),
                                          ),
                                      ],
                                  }
                                : {}),
                            ...(bloc.defaultExample
                                ? {
                                      initialDocument: collectionExampleDocument(
                                          release,
                                          bloc.defaultExample,
                                          release.locale,
                                          snapshot.collections.map((item) => item.release),
                                      ),
                                  }
                                : {}),
                            ...(bloc.order === undefined ? {} : { catalogueOrder: bloc.order }),
                            description: bloc.description
                                ? resolveCollectionTranslation(release, bloc.description)
                                : "",
                            ownership: { kind: "code-managed" },
                            uses: bloc.uses,
                            viewJS: bloc.kind === "component" ? (bloc.runtime?.viewJS ?? "") : "",
                            catalogue: bloc.catalogue,
                            root: bloc.root,
                            kind: bloc.kind,
                            markupHTML: bloc.markup,
                            ...(bloc.browser === undefined ? {} : { browser: bloc.browser }),
                            ...(bloc.kind === "component" && bloc.runtime?.styleCSS
                                ? {
                                      styleCSS: bloc.runtime.styleCSS,
                                      styleCollectionId: collectionId,
                                  }
                                : {}),
                            slots: bloc.slots,
                            ...(bloc.kind === "component" && bloc.settings
                                ? { settings: localizeSettings(release, bloc.settings) }
                                : {}),
                        });
                        return {
                            tag: bloc.id,
                            contributionId: collectionId,
                            ownership: { kind: "code-managed" as const },
                            artifact,
                        };
                    }),
                ),
            ),
        );
        const records = collections.flat();
        return {
            revision: snapshot.revision,
            collections: snapshot.collections,
            records,
            byTag: new Map(records.map((record) => [record.tag, record])),
        };
    };
    const records = async () => {
        const [local, resources] = await Promise.all([repository.getBlocRecords(), installedState()]);
        if (resources.records.some(({ tag }) => local.some((record) => record.tag === tag))) {
            throw new Error("Installed collection collides with a local bloc tag");
        }
        return [...local, ...structuredClone(resources.records)];
    };
    const read = async (tag: string) => {
        const resource = (await installedState()).byTag.get(tag);
        return resource ? structuredClone(resource) : repository.getBlocRecord(tag);
    };
    const releases = async () => (await installedState()).collections.map((item) => item.release);
    const overrides: Partial<CmsRepository> = {
        getSystem: async () => {
            const system = await repository.getSystem();
            return { ...system, theme: composeCollectionThemes(system.theme, await releases()) };
        },
        updateSystem: async (patch, expectedRevision) =>
            repository.updateSystem(
                patch.theme ? { ...patch, theme: composeCollectionThemes(patch.theme, await releases()) } : patch,
                expectedRevision,
            ),
        getContentContributions: async () => {
            const snapshot = await installedSnapshot();
            const registered = routes ? await routes.list(siteId) : [];
            const paths = new Map(
                registered.flatMap((route) =>
                    route.page.kind === "contribution"
                        ? [
                              [
                                  `${route.page.sourceId}\0${route.page.contributionId}\0${route.page.pageId}`,
                                  route.path,
                              ] as const,
                          ]
                        : [],
                ),
            );
            const releases = snapshot.collections.map(({ release }) => release);
            const pages: RenderablePage[] = snapshot.collections.flatMap(
                ({ collectionId, digest, release }) =>
                    release.pages?.map((page) => {
                        const reference = {
                            kind: "contribution" as const,
                            sourceId: release.publisherId,
                            contributionId: collectionId,
                            pageId: page.id,
                        };
                        const path =
                            paths.get(`${release.publisherId}\0${collectionId}\0${page.id}`) ?? page.defaultPath;
                        const language = release.locale;
                        const revision = 1;
                        return {
                            reference,
                            source: {
                                ...reference,
                                version: release.version,
                                digest,
                                defaultPath: page.defaultPath,
                            },
                            language,
                            requirements: pageRequirements(releases, page),
                            page: {
                                id: page.id,
                                revision,
                                path,
                                content: page.document.html,
                                title: resolveCollectionTranslation(release, page.name, language),
                                description: page.description
                                    ? resolveCollectionTranslation(release, page.description, language)
                                    : "",
                                visible: true,
                                tags: [],
                                indexing: { enabled: false },
                            },
                        };
                    }) ?? [],
            );
            const routeRevision = registered
                .map(({ page, path, revision }) => `${JSON.stringify(page)}:${path}:${revision}`)
                .sort()
                .join("|");
            return {
                revision: routeRevision ? `${snapshot.revision}:${routeRevision}` : snapshot.revision,
                pages,
                texts: snapshot.collections.map(({ release, textOverrides }) =>
                    projectCollectionTextSource({ collection: release, overrides: textOverrides }),
                ),
            };
        },
        getPageRequirements: async (page) => {
            const [local, installed] = await Promise.all([
                repository.getBlocsList({ includeHidden: true }),
                installedState(),
            ]);
            const resources = installed.records.map((record) => structuredClone(record.artifact!));
            const uses = await createBlocUsageResolver([...local, ...resources], {
                getBlocViewJS: async (tag) => {
                    const record = installed.byTag.get(tag);
                    return record ? record.artifact?.viewJS || null : repository.getBlocViewJS(tag);
                },
            })(page.content);
            return pageRequirements(
                installed.collections.map(({ release }) => release),
                { uses, requires: [] },
            );
        },
        getBlocRecords: records,
        getBlocRecord: read,
        getBlocsList: async (options) => {
            const local = await repository.getBlocsList(options);
            const resources = (await installedState()).records.map((record) => ({
                ...structuredClone(record.artifact!),
                hasBehavior: Boolean(record.artifact?.viewJS),
            }));
            return [...local, ...resources.filter((bloc) => options?.includeHidden || bloc.catalogue !== "hidden")];
        },
        getBlocViewJS: async (tag) => {
            const record = (await installedState()).byTag.get(tag);
            return record ? record.artifact?.viewJS || null : repository.getBlocViewJS(tag);
        },
        getBlocViewsJS: async (tags) => {
            const uniqueTags = [...new Set(tags)];
            const installed = await installedState();
            const localTags = uniqueTags.filter((tag) => !installed.byTag.has(tag));
            const local = localTags.length ? await repository.getBlocViewsJS(localTags) : {};
            return Object.fromEntries(
                uniqueTags.map((tag) => [tag, installed.byTag.get(tag)?.artifact?.viewJS || local[tag] || null]),
            );
        },
        getBlocSource: async (tag) => ((await installedState()).byTag.has(tag) ? null : repository.getBlocSource(tag)),
    };
    return new Proxy(repository, {
        get(target, key) {
            const policy = CMS_REPOSITORY_METHOD_POLICY[key as CmsRepositoryMethod];
            if (policy === "override") {
                const override = overrides[key as keyof CmsRepository];
                if (typeof override !== "function") {
                    throw new Error(`Missing installed collection override: ${String(key)}`);
                }
                return override;
            }
            const value = Reflect.get(target, key);
            if (typeof value !== "function") {
                return value;
            }
            if (!policy) {
                throw new Error(`Unclassified CmsRepository method: ${String(key)}`);
            }
            if (policy === "delegate") {
                return value.bind(target);
            }
            return async (...args: unknown[]) => {
                const first = args[0] as { id?: string; tag?: string } | string;
                const tag = typeof first === "string" ? first : (first.tag ?? first.id);
                if (tag && (await installedState()).byTag.has(tag)) {
                    throw Object.assign(new Error("Installed collection blocs are immutable"), { status: 409 });
                }
                return value.apply(target, args);
            };
        },
    });
}

function localizeSettings(
    release: CollectionRelease,
    settings: CollectionComponentSettings,
): CollectionComponentSettings {
    return settings.map(
        ({ deprecation: _deprecation, ...setting }) =>
            ({
                ...setting,
                label: resolveCollectionTranslation(release, setting.label),
                ...(setting.group ? { group: resolveCollectionTranslation(release, setting.group) } : {}),
                ...(setting.help ? { help: resolveCollectionTranslation(release, setting.help) } : {}),
                control: localizeControl(release, setting.control),
            }) as CollectionSettingItem,
    );
}

function localizeControl(release: CollectionRelease, control: CollectionSettingControl): CollectionSettingControl {
    if (control.kind === "text") {
        return {
            ...control,
            ...(control.placeholder ? { placeholder: resolveCollectionTranslation(release, control.placeholder) } : {}),
        };
    }
    if (control.kind === "number" || control.kind === "range") {
        return {
            ...control,
            ...(control.suffix ? { suffix: resolveCollectionTranslation(release, control.suffix) } : {}),
        };
    }
    if (control.kind === "select" || control.kind === "segmented") {
        return {
            ...control,
            options: control.options.map((option) => ({
                ...option,
                label: resolveCollectionTranslation(release, option.label),
            })),
        };
    }
    if (control.kind === "color" && control.tokens) {
        return {
            ...control,
            tokens: control.tokens.map((option) => ({
                ...option,
                label: resolveCollectionTranslation(release, option.label),
            })),
        };
    }
    return control;
}
