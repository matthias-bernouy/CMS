import { randomUUIDv7 } from "bun";
import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type { BlocListItemResponse, CmsRepository, PageLink } from "src/socle/interfaces/CmsRepository";
import type { TBloc, TPage, TSnippet, TSystem, TTemplate } from "src/socle/interfaces/models";
import type { DataProviderConsumers, TDataAuth, TDataMockup, TDataProvider, TDataProviderListItem } from "src/socle/interfaces/Data/data";
import { countOpenApiEndpoints, dataProviderSyncBadge } from "src/socle/utils/openapi";

/**
 * MongoDB implementation of `CmsRepository`. Designed for small/medium
 * single-instance deployments — no transactions, no sharding, no replica-set
 * assumptions. Concurrency is handled through unique indexes (paths,
 * snippet identifiers, bloc tags); admin write traffic is low enough that
 * read-modify-write on the system singleton is acceptable.
 *
 * The caller owns the `MongoClient` lifecycle (connect / close). Pass the
 * `Db` instance and call `init()` once at startup to create indexes.
 *
 * Schema choices:
 *   - Each domain object lives in its own collection.
 *   - The model's `id: string` is stored as Mongo's `_id` (not a separate
 *     field, not an `ObjectId`). On reads we project `_id` back to `id` so
 *     the public contract stays unchanged.
 *   - For blocs, `_id` IS the custom-element tag — so `createBloc` on a
 *     duplicate tag throws Mongo error code `11000`, which `bloc.post.ts`
 *     inspects to map to a 409. Don't swallow it here.
 *   - System is a singleton: a single document with `_id: "singleton"`,
 *     created lazily on first read.
 */
export type MongoCmsRepositoryConfig = {
    /**
     * Prefix prepended to every collection name (`pages`, `blocs`, …).
     * Used by multi-tenant deployments to isolate one tenant's data per
     * collection set in a shared Db. Default `""` (single-tenant).
     */
    collectionPrefix?: string;
};

export class MongoCmsRepository implements CmsRepository {

    private readonly _prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoCmsRepositoryConfig = {},
    ) {
        this._prefix = config.collectionPrefix ?? "";
    }

    /**
     * Create the unique indexes the contract relies on. Idempotent — safe
     * to call on every boot. Run once before the first request hits the
     * repository so concurrent inserts can't slip a duplicate path or
     * identifier through.
     */
    async init(): Promise<void> {
        // Backfill before indexing — legacy templates created prior to PR 2
        // have no `identifier` field, which collides on the unique index.
        // Default the identifier to the doc id (UUID, already kebab-shaped).
        await this.templates.updateMany(
            { $or: [{ identifier: { $exists: false } }, { identifier: null }, { identifier: "" }] } as never,
            [{ $set: { identifier: "$_id" } }] as never,
        );
        await Promise.all([
            this.pages.createIndex    ({ path: 1 },       { unique: true }),
            this.snippets.createIndex ({ identifier: 1 }, { unique: true }),
            this.templates.createIndex({ identifier: 1 }, { unique: true }),
            this.dataMockups.createIndex({ providerId: 1, method: 1, path: 1, name: 1 }, { unique: true }),
            this.dataMockups.createIndex({ providerId: 1, method: 1, path: 1 }),
        ]);
    }

    // ── Collections ──

    private get blocs():         Collection<BlocDoc>         { return this.db.collection<BlocDoc>         (this._prefix + "blocs"); }
    private get pages():         Collection<PageDoc>         { return this.db.collection<PageDoc>         (this._prefix + "pages"); }
    private get snippets():      Collection<SnippetDoc>      { return this.db.collection<SnippetDoc>      (this._prefix + "snippets"); }
    private get templates():     Collection<TemplateDoc>     { return this.db.collection<TemplateDoc>     (this._prefix + "templates"); }
    private get system():        Collection<SystemDoc>       { return this.db.collection<SystemDoc>       (this._prefix + "system"); }
    private get dataProviders(): Collection<DataProviderDoc> { return this.db.collection<DataProviderDoc> (this._prefix + "dataProviders"); }
    private get dataMockups():   Collection<DataMockupDoc>   { return this.db.collection<DataMockupDoc>   (this._prefix + "dataMockups"); }

    // ── Blocs ──

    async createBloc(bloc: TBloc): Promise<TBloc> {
        await this.blocs.insertOne(toDoc(bloc) as OptionalUnlessRequiredId<BlocDoc>);
        return bloc;
    }

    async replaceBloc(bloc: TBloc): Promise<TBloc> {
        await this.blocs.replaceOne(
            { _id: bloc.id },
            toDoc(bloc),
            { upsert: true },
        );
        return bloc;
    }

    async getBlocsJS(): Promise<{ id: string; editorJS: string; viewJS: string }[]> {
        const docs = await this.blocs.find(
            {},
            { projection: { editorJS: 1, viewJS: 1 } },
        ).toArray();
        return docs.map(d => ({ id: d._id, editorJS: d.editorJS, viewJS: d.viewJS }));
    }

    async getBlocsList(): Promise<BlocListItemResponse[]> {
        const docs = await this.blocs.find(
            {},
            { projection: { name: 1, group: 1, description: 1 } },
        ).toArray();
        return docs.map(d => ({
            id:          d._id,
            name:        d.name,
            group:       d.group       || "",
            description: d.description || "",
        }));
    }

    async getBlocViewJS(htmlTag: string): Promise<string | null> {
        const doc = await this.blocs.findOne(
            { _id: htmlTag },
            { projection: { viewJS: 1 } },
        );
        return doc?.viewJS ?? null;
    }

    async getBlocSource(htmlTag: string): Promise<Record<string, string> | null> {
        const doc = await this.blocs.findOne(
            { _id: htmlTag },
            { projection: { source: 1 } },
        );
        return doc?.source ?? null;
    }

    // ── Pages ──

    async getPage(path: string): Promise<TPage | null> {
        const doc = await this.pages.findOne({ path });
        return fromPageDoc(doc);
    }

    async getAllPages(): Promise<TPage[]> {
        const docs = await this.pages.find().toArray();
        return docs.map(d => fromPageDoc(d)!);
    }

    async insertPage(path: string, title: string): Promise<void> {
        const id = randomUUIDv7();
        await this.pages.insertOne({
            _id: id,
            path,
            title,
            content: "<p></p>",
            description: "",
            tags: [],
            visible: false,
        });
    }

    async getPageById(id: string): Promise<TPage | null> {
        const doc = await this.pages.findOne({ _id: id });
        return fromPageDoc(doc);
    }

    async updatePage(page: Partial<TPage>): Promise<void> {
        if (!page.id) throw new Error("updatePage requires `id` on the input.");
        const { id, ...rest } = page;
        await this.pages.updateOne({ _id: id }, { $set: rest });
    }

    async getLinks(): Promise<PageLink[]> {
        const docs = await this.pages.find(
            {},
            { projection: { path: 1, title: 1 } },
        ).toArray();
        return docs.map(d => ({ path: d.path, title: d.title }));
    }

    async getPagesMetadata(): Promise<{ id: string; path: string; title: string; tags: string[]; visible: boolean }[]> {
        const docs = await this.pages.find(
            {},
            { projection: { path: 1, title: 1, tags: 1, visible: 1 } },
        ).toArray();
        return docs.map(d => ({
            id:      d._id,
            path:    d.path,
            title:   d.title,
            tags:    d.tags,
            visible: d.visible,
        }));
    }

    async getTemplatesMetadata(): Promise<{ id: string; identifier: string; name: string; category: string; createdAt: string }[]> {
        const docs = await this.templates.find(
            {},
            { projection: { identifier: 1, name: 1, category: 1, createdAt: 1 } },
        ).toArray();
        return docs.map(d => ({
            id:         d._id,
            identifier: d.identifier,
            name:       d.name,
            category:   d.category,
            createdAt:  d.createdAt.toDateString(),
        }));
    }

    // ── System ──

    async getSystem(): Promise<TSystem> {
        const doc = await this.system.findOne({ _id: SYSTEM_ID });
        if (doc) {
            const { _id, ...rest } = doc;
            return rest;
        }
        // Lazy creation on first access — keeps the contract synchronous-feeling
        // for callers and avoids requiring a separate `seed()` step.
        const fresh = defaultSystem();
        await this.system.insertOne({ _id: SYSTEM_ID, ...fresh });
        return fresh;
    }

    async updateSystem(update: Partial<TSystem>): Promise<TSystem> {
        const current = await this.getSystem();
        // Section-level shallow merge: top-level scalars overwrite, top-level
        // objects (`site`, `editor`) deep-merge one level. Mirrors the
        // in-memory behaviour so callers can keep doing partial updates like
        // `{ site: { name: "..." } }` without clobbering the rest of `site`.
        const merged = { ...current };
        for (const [section, value] of Object.entries(update) as [keyof TSystem, unknown][]) {
            if (section === "initializationStep") {
                merged.initializationStep = value as number;
            } else if (typeof value === "object" && value !== null) {
                (merged as any)[section] = {
                    ...(current as any)[section],
                    ...value,
                };
            }
        }
        await this.system.replaceOne(
            { _id: SYSTEM_ID },
            merged,
            { upsert: true },
        );
        return merged;
    }

    // ── Templates ──

    async createTemplate(template: Omit<TTemplate, "id">): Promise<TTemplate> {
        const id = randomUUIDv7();
        await this.templates.insertOne({ _id: id, ...template });
        return { id, ...template };
    }

    async getTemplateById(id: string): Promise<TTemplate | null> {
        const doc = await this.templates.findOne({ _id: id });
        return fromTemplateDoc(doc);
    }

    async getTemplateByIdentifier(identifier: string): Promise<TTemplate | null> {
        const doc = await this.templates.findOne({ identifier });
        return fromTemplateDoc(doc);
    }

    async getAllTemplates(): Promise<TTemplate[]> {
        const docs = await this.templates.find().toArray();
        return docs.map(d => fromTemplateDoc(d)!);
    }

    async getTemplateCategories(): Promise<string[]> {
        const raw = await this.templates.distinct("category");
        return (raw as string[])
            .filter(c => typeof c === "string" && c.length > 0)
            .sort();
    }

    async updateTemplate(id: string, data: Partial<TTemplate>): Promise<TTemplate | null> {
        // Strip immutable fields so callers can't rewrite them.
        const { id: _id, identifier: _ident, createdAt: _ca, ...rest } = data;
        const doc = await this.templates.findOneAndUpdate(
            { _id: id },
            { $set: rest },
            { returnDocument: "after" },
        );
        return fromTemplateDoc(doc);
    }

    async deleteTemplate(id: string): Promise<void> {
        await this.templates.deleteOne({ _id: id });
    }

    // ── Snippets ──

    async createSnippet(snippet: Omit<TSnippet, "id">): Promise<TSnippet> {
        const id = randomUUIDv7();
        await this.snippets.insertOne({ _id: id, ...snippet });
        return { id, ...snippet };
    }

    async getSnippetById(id: string): Promise<TSnippet | null> {
        const doc = await this.snippets.findOne({ _id: id });
        return fromSnippetDoc(doc);
    }

    async getSnippetByIdentifier(identifier: string): Promise<TSnippet | null> {
        const doc = await this.snippets.findOne({ identifier });
        return fromSnippetDoc(doc);
    }

    async getAllSnippets(): Promise<TSnippet[]> {
        const docs = await this.snippets.find().toArray();
        return docs.map(d => fromSnippetDoc(d)!);
    }

    async getSnippetsMetadata(): Promise<{ id: string; identifier: string; name: string; category: string; updatedAt: string }[]> {
        const docs = await this.snippets.find(
            {},
            { projection: { identifier: 1, name: 1, category: 1, updatedAt: 1 } },
        ).toArray();
        return docs.map(d => ({
            id:         d._id,
            identifier: d.identifier,
            name:       d.name,
            category:   d.category,
            updatedAt:  d.updatedAt.toDateString(),
        }));
    }

    async updateSnippet(id: string, data: Partial<TSnippet>): Promise<TSnippet | null> {
        // Strip immutable fields so callers can't accidentally rewrite them.
        const { id: _id, identifier: _identifier, createdAt: _createdAt, ...rest } = data;
        const doc = await this.snippets.findOneAndUpdate(
            { _id: id },
            { $set: { ...rest, updatedAt: new Date() } },
            { returnDocument: "after" },
        );
        return fromSnippetDoc(doc);
    }

    async deleteSnippet(id: string): Promise<void> {
        await this.snippets.deleteOne({ _id: id });
    }

    async findPagesUsingSnippet(identifier: string): Promise<TPage[]> {
        const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = `<w13c-snippet[^>]*\\bidentifier\\s*=\\s*["']${escaped}["']`;
        const docs = await this.pages.find({ content: { $regex: pattern, $options: "i" } }).toArray();
        return docs.map(d => fromPageDoc(d)!);
    }

    // ── Data providers ──

    async createDataProvider(provider: Omit<TDataProvider, "createdAt" | "lastSyncAt">): Promise<TDataProvider> {
        const stored: TDataProvider = {
            ...provider,
            server:     provider.server ?? "",
            createdAt:  new Date(),
            lastSyncAt: null,
        };
        await this.dataProviders.insertOne(toDataProviderDoc(stored) as OptionalUnlessRequiredId<DataProviderDoc>);
        return stored;
    }

    async getDataProvider(id: string): Promise<TDataProvider | null> {
        return fromDataProviderDoc(await this.dataProviders.findOne({ _id: id }));
    }

    async getDataProviders(): Promise<TDataProvider[]> {
        const docs = await this.dataProviders.find().toArray();
        return docs.map(d => fromDataProviderDoc(d)!);
    }

    async getDataProvidersList(): Promise<TDataProviderListItem[]> {
        const docs = await this.dataProviders.find(
            {},
            { projection: { source: 1, server: 1, spec: 1, lastSyncAt: 1 } },
        ).toArray();
        return docs.map(d => {
            const lastSync = d.lastSyncAt ? new Date(d.lastSyncAt) : null;
            const badge = dataProviderSyncBadge(lastSync);
            return {
                id:            d._id,
                source:        d.source,
                server:        d.server ?? "",
                endpointCount: countOpenApiEndpoints(d.spec ?? ""),
                lastSyncAt:    lastSync ? lastSync.toDateString() : "",
                syncLabel:     badge.label,
                syncColor:     badge.color,
            };
        });
    }

    async updateDataProvider(id: string, data: Partial<TDataProvider>): Promise<TDataProvider | null> {
        // `id` and `createdAt` are immutable on the server side — strip
        // them from the patch so a malformed client can't rewrite them.
        const { id: _ignored, createdAt: __, ...rest } = data;
        const result = await this.dataProviders.findOneAndUpdate(
            { _id: id },
            { $set: rest as Partial<DataProviderDoc> },
            { returnDocument: "after" },
        );
        return fromDataProviderDoc(result as DataProviderDoc | null);
    }

    async deleteDataProvider(id: string): Promise<void> {
        await Promise.all([
            this.dataProviders.deleteOne({ _id: id }),
            this.dataMockups.deleteMany({ providerId: id }),
        ]);
    }

    // ── Data mockups ──

    async listMockups(providerId: string): Promise<TDataMockup[]> {
        const docs = await this.dataMockups.find({ providerId }).toArray();
        return docs.map(fromDataMockupDoc);
    }

    async getMockup(providerId: string, method: string, path: string, name: string): Promise<TDataMockup | null> {
        const doc = await this.dataMockups.findOne({ providerId, method: method.toUpperCase(), path, name });
        return doc ? fromDataMockupDoc(doc) : null;
    }

    async getActiveMockup(providerId: string, method: string, path: string): Promise<TDataMockup | null> {
        const doc = await this.dataMockups.findOne({ providerId, method: method.toUpperCase(), path, active: true });
        return doc ? fromDataMockupDoc(doc) : null;
    }

    async createMockup(mockup: Omit<TDataMockup, 'updatedAt' | 'active'>): Promise<TDataMockup> {
        const method  = mockup.method.toUpperCase();
        const isFirst = !(await this.getActiveMockup(mockup.providerId, method, mockup.path));
        const stored: TDataMockup = {
            ...mockup,
            method,
            active:    isFirst,
            updatedAt: new Date(),
        };
        await this.dataMockups.insertOne(stored as OptionalUnlessRequiredId<DataMockupDoc>);
        return stored;
    }

    async updateMockup(providerId: string, method: string, path: string, name: string, patch: Partial<Pick<TDataMockup, 'status' | 'body' | 'name'>>): Promise<TDataMockup | null> {
        const m = method.toUpperCase();
        const $set: Partial<DataMockupDoc> = { updatedAt: new Date() };
        if (patch.status !== undefined) $set.status = patch.status;
        if (patch.body   !== undefined) $set.body   = patch.body;
        if (patch.name   !== undefined) $set.name   = patch.name;
        const result = await this.dataMockups.findOneAndUpdate(
            { providerId, method: m, path, name },
            { $set },
            { returnDocument: "after" },
        );
        return result ? fromDataMockupDoc(result) : null;
    }

    async deleteMockup(providerId: string, method: string, path: string, name: string): Promise<void> {
        const m       = method.toUpperCase();
        const removed = await this.dataMockups.findOneAndDelete({ providerId, method: m, path, name });
        if (removed?.active) {
            const replacement = await this.dataMockups.findOne({ providerId, method: m, path });
            if (replacement) {
                await this.dataMockups.updateOne(
                    { providerId, method: m, path, name: replacement.name },
                    { $set: { active: true } },
                );
            }
        }
    }

    async setActiveMockup(providerId: string, method: string, path: string, name: string | null): Promise<void> {
        const m = method.toUpperCase();
        await this.dataMockups.updateMany(
            { providerId, method: m, path },
            { $set: { active: false } },
        );
        if (name !== null) {
            await this.dataMockups.updateOne(
                { providerId, method: m, path, name },
                { $set: { active: true } },
            );
        }
    }

    async findConsumersOfProvider(providerServerUrl: string): Promise<DataProviderConsumers> {
        const trimmed = providerServerUrl.trim().replace(/\/+$/, "");
        if (!trimmed) return { pages: [], templates: [], snippets: [] };
        const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = `${escaped}(?![A-Za-z0-9._~%-])`;
        const [pages, templates, snippets] = await Promise.all([
            this.pages.find    ({ content: { $regex: pattern } }, { projection: { path: 1, title: 1 } }).toArray(),
            this.templates.find({ content: { $regex: pattern } }, { projection: { identifier: 1, name: 1 } }).toArray(),
            this.snippets.find ({ content: { $regex: pattern } }, { projection: { identifier: 1, name: 1 } }).toArray(),
        ]);
        return {
            pages:     pages.map    (d => ({ path: d.path, title: d.title })),
            templates: templates.map(d => ({ identifier: d.identifier, name: d.name })),
            snippets:  snippets.map (d => ({ identifier: d.identifier, name: d.name })),
        };
    }
}

function toDataProviderDoc(p: TDataProvider): DataProviderDoc {
    const { id, ...rest } = p;
    return { _id: id, ...rest };
}

function fromDataProviderDoc(d: DataProviderDoc | null): TDataProvider | null {
    if (!d) return null;
    const { _id, ...rest } = d;
    // `server` defaults to "" for providers stored before the field was
    // introduced. `auth` was the single field before we split it into
    // `specAuth` + `runtimeAuth`; legacy rows still carry it. We mirror
    // the legacy value into both halves on read — the next write through
    // `updateDataProvider` persists the new shape and `auth` becomes
    // dead data (silently dropped because TDataProvider doesn't carry
    // it any longer). No one-shot migration script needed.
    const legacyAuth = (rest as { auth?: TDataAuth }).auth;
    const specAuth    = rest.specAuth    ?? legacyAuth ?? { type: "none" };
    const runtimeAuth = rest.runtimeAuth ?? legacyAuth ?? { type: "none" };
    return {
        id:          _id,
        source:      rest.source,
        sourceUrl:   rest.sourceUrl,
        server:      rest.server ?? "",
        spec:        rest.spec,
        specAuth,
        runtimeAuth,
        createdAt:   rest.createdAt,
        lastSyncAt:  rest.lastSyncAt,
    };
}

// ── Document shapes (collection generics) ──

type WithMongoId<T extends { id: string }> = Omit<T, "id"> & { _id: string };

type BlocDoc         = WithMongoId<TBloc>;
type PageDoc         = WithMongoId<TPage>;
type SnippetDoc      = WithMongoId<TSnippet>;
type TemplateDoc     = WithMongoId<TTemplate>;
type DataProviderDoc = WithMongoId<TDataProvider>;
type DataMockupDoc   = TDataMockup;
type SystemDoc       = TSystem & { _id: typeof SYSTEM_ID };

function fromDataMockupDoc(d: DataMockupDoc & { _id?: unknown }): TDataMockup {
    return {
        providerId: d.providerId,
        method:     d.method,
        path:       d.path,
        name:       d.name,
        status:     d.status,
        body:       d.body,
        active:     d.active,
        updatedAt:  new Date(d.updatedAt),
    };
}

const SYSTEM_ID = "singleton" as const;

function toDoc<T extends { id: string }>(model: T): WithMongoId<T> {
    const { id, ...rest } = model;
    return { _id: id, ...rest } as WithMongoId<T>;
}

// Per-type read helpers. A single generic `fromDoc<T>` doesn't propagate
// inference from the contextual return type, so TypeScript collapses T to
// its constraint default (`{ id: string }`) and complains. Four 1-line
// helpers are clearer than 11 explicit type arguments at call sites.
function fromPageDoc(d: PageDoc | null): TPage | null {
    if (!d) return null;
    const { _id, ...rest } = d;
    return { id: _id, ...rest };
}
function fromSnippetDoc(d: SnippetDoc | null): TSnippet | null {
    if (!d) return null;
    const { _id, ...rest } = d;
    return { id: _id, ...rest };
}
function fromTemplateDoc(d: TemplateDoc | null): TTemplate | null {
    if (!d) return null;
    const { _id, ...rest } = d;
    return { id: _id, ...rest };
}

function defaultSystem(): TSystem {
    return {
        initializationStep: 0,
        site: {
            name: "",
            favicon: "",
            visible: true,
            host: "",
            language: "",
            theme: "",
            notFound: null,
            serverError: null,
        },
        editor:   { layoutCategory: "" },
        security: { connectExtras: [], mediaExtras: [] },
    };
}
