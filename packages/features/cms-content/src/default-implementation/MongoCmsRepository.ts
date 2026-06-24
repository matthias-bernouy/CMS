import { randomUUIDv7 } from "bun";
import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type { BlocListItemResponse, CmsRepository, PageLink, PageMeta, PagesQuery } from "cms-content/interfaces/CmsRepository";
import type { TBloc } from "cms-content/interfaces/blocs";
import type { TPage } from "cms-content/interfaces/pages";
import type { TSnippet } from "cms-content/interfaces/snippets";
import type { TSystem } from "cms-content/interfaces/settings";
import type { TTemplate } from "cms-content/interfaces/templates";
import { escapeRegex } from "cms-content/core/utils/escapeRegex";
import { snippetRefPattern } from "cms-content/core/utils/contentRefs";
import { defaultSystem, mergeSystemUpdate } from "cms-content/core/system";
import { countValues, normalizeTags } from "cms-content/core/counts";
import { DuplicateBlocTagError } from "cms-content/core/errors";
import { isPublishedPage } from "cms-content/core/publication";

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
 *   - For blocs, `_id` IS the custom-element tag; duplicate tags are surfaced
 *     as `DuplicateBlocTagError` so HTTP surfaces do not inspect Mongo codes.
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
        // Normalize missing identifiers before indexing to avoid collisions on
        // the unique index.
        // Default the identifier to the doc id (UUID, already kebab-shaped).
        await this.templates.updateMany(
            { $or: [{ identifier: { $exists: false } }, { identifier: null }, { identifier: "" }] } as never,
            [{ $set: { identifier: "$_id" } }] as never,
        );
        await Promise.all([
            this.pages.createIndex    ({ path: 1 },       { unique: true }),
            this.snippets.createIndex ({ identifier: 1 }, { unique: true }),
            this.templates.createIndex({ identifier: 1 }, { unique: true }),
        ]);
    }

    // ── Collections ──

    private get blocs():         Collection<BlocDoc>         { return this.db.collection<BlocDoc>         (this._prefix + "blocs"); }
    private get pages():         Collection<PageDoc>         { return this.db.collection<PageDoc>         (this._prefix + "pages"); }
    private get snippets():      Collection<SnippetDoc>      { return this.db.collection<SnippetDoc>      (this._prefix + "snippets"); }
    private get templates():     Collection<TemplateDoc>     { return this.db.collection<TemplateDoc>     (this._prefix + "templates"); }
    private get system():        Collection<SystemDoc>       { return this.db.collection<SystemDoc>       (this._prefix + "system"); }

    // ── Blocs ──

    async createBloc(bloc: TBloc): Promise<TBloc> {
        try {
            await this.blocs.insertOne(toDoc(bloc) as OptionalUnlessRequiredId<BlocDoc>);
        } catch (e) {
            if ((e as { code?: number }).code === 11000) throw new DuplicateBlocTagError(bloc.id);
            throw e;
        }
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

    async getPublishedPage(path: string): Promise<TPage | null> {
        const page = await this.getPage(path);
        return isPublishedPage(page) ? page : null;
    }

    async getPublishedPages(): Promise<TPage[]> {
        return (await this.getAllPages()).filter(isPublishedPage);
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

    async deletePage(id: string): Promise<void> {
        await this.pages.deleteOne({ _id: id });
    }

    async getLinks(): Promise<PageLink[]> {
        const docs = await this.pages.find(
            {},
            { projection: { path: 1, title: 1 } },
        ).toArray();
        return docs.map(d => ({ path: d.path, title: d.title }));
    }

    async getPagesMetadata(opts: PagesQuery = {}): Promise<PageMeta[]> {
        // Filtering + sorting run IN the query — page metadata isn't encrypted,
        // so `$regex` on title/path and a server-side sort are all available.
        const filter: Record<string, unknown> = {};
        const search = opts.search?.trim();
        if (search) {
            const rx = { $regex: escapeRegex(search), $options: "i" };
            filter.$or = [{ title: rx }, { path: rx }];
        }
        if (opts.tag)                     filter.tags = opts.tag;
        if (opts.visible === "published") filter.visible = true;
        else if (opts.visible === "draft") filter.visible = false;

        const sortField = opts.sortBy ?? "title";
        const sort = { [sortField]: opts.sortOrder === "desc" ? -1 : 1 } as Record<string, 1 | -1>;

        // Collation strength 1 → case- and accent-insensitive sort, matching
        // the in-memory impls' `localeCompare(sensitivity: "base")`.
        const docs = await this.pages.find(filter, {
            projection: { path: 1, title: 1, tags: 1, visible: 1 },
        }).collation({ locale: "en", strength: 1 }).sort(sort).toArray();

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

    async getTagCounts() {
        const docs = await this.pages.find({}, { projection: { tags: 1 } }).toArray();
        return countValues(docs.flatMap(d => normalizeTags((d as { tags: unknown }).tags)));
    }

    async getCategoryCounts(resource: "snippets" | "templates") {
        const collection = resource === "snippets" ? this.snippets : this.templates;
        const docs = await collection.find({}, { projection: { category: 1 } }).toArray();
        return countValues(docs.map(d => d.category));
    }

    // ── System ──

    async getSystem(): Promise<TSystem> {
        const doc = await this.system.findOne({ _id: SYSTEM_ID });
        if (doc) {
            const { _id, ...rest } = doc;
            return mergeSystemUpdate(defaultSystem(), rest);
        }
        // Lazy creation on first access — keeps the contract synchronous-feeling
        // for callers and avoids requiring a separate `seed()` step.
        const fresh = defaultSystem();
        await this.system.insertOne({ _id: SYSTEM_ID, ...fresh });
        return fresh;
    }

    async updateSystem(update: Partial<TSystem>): Promise<TSystem> {
        const current = await this.getSystem();
        const merged = mergeSystemUpdate(current, update);
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
        const pattern = snippetRefPattern(identifier);
        const docs = await this.pages.find({ content: { $regex: pattern, $options: "i" } }).toArray();
        return docs.map(d => fromPageDoc(d)!);
    }
}

// ── Document shapes (collection generics) ──

type WithMongoId<T extends { id: string }> = Omit<T, "id"> & { _id: string };

type BlocDoc         = WithMongoId<TBloc>;
type PageDoc         = WithMongoId<TPage>;
type SnippetDoc      = WithMongoId<TSnippet>;
type TemplateDoc     = WithMongoId<TTemplate>;
type SystemDoc       = TSystem & { _id: typeof SYSTEM_ID };

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
