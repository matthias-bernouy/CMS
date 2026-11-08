import { localeSchema } from "resources/artifacts/archive/schemas";
import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import type { ContentTextSource } from "@bernouy/content/rendering";
import type { ResourceMetadataStore, ResourceTextSnapshot } from "resources/interfaces/entities";
import { ResourceArchiveError } from "resources/artifacts/archive/errors";
import {
    createTextRecord,
    readTextRecord,
    resourceDigest,
    ResourceConflictError,
    assertResourceScope,
} from "./records";
import type { ResourceTextRecord } from "./records";

export class ResourceTexts {
    constructor(private readonly metadata: ResourceMetadataStore) {
        assertResourceScope(metadata.scopeId);
    }
    async createExact(source: unknown): Promise<void> {
        return this.metadata.createTexts(createTextRecord(source));
    }
    async snapshot(): Promise<ResourceTextSnapshot> {
        const sources = (await this.metadata.readTexts())
            .map(readTextRecord)
            .sort((a, b) =>
                a.source.namespace < b.source.namespace ? -1 : a.source.namespace > b.source.namespace ? 1 : 0,
            );
        if (sources.length > 32 || new Set(sources.map((row) => row.source.namespace)).size !== sources.length) {
            throw new ResourceArchiveError("Resource text snapshot is incomplete or exceeds its limit");
        }
        return deepFreeze({
            revision: resourceDigest(sources.map((row) => [row.source.namespace, row.revision])),
            sources,
        });
    }
    async save(namespace: string, textId: string, locale: string, value: string | null, expectedRevision: string) {
        const stored = await this.metadata.getTexts(namespace);
        const current = stored ? readTextRecord(stored) : null;
        if (current && current.source.namespace !== namespace) {
            throw new ResourceArchiveError("Resource text namespace mismatch");
        }
        if (!current || current.revision !== expectedRevision) {
            throw new ResourceConflictError("Resource text revision changed");
        }
        if (!current.source.texts.some((text) => text.id === textId)) {
            throw new ResourceArchiveError("Unknown resource text");
        }
        localeSchema.parse(locale);
        const overrides = structuredClone(current.overrides);
        if (value === null) {
            delete overrides[textId]?.[locale];
            if (!Object.keys(overrides[textId] ?? {}).length) {
                delete overrides[textId];
            }
        } else {
            overrides[textId] = { ...overrides[textId], [locale]: value };
        }
        const next = createTextRecord(current.source, overrides);
        if (next.revision !== current.revision) {
            await this.metadata.replaceTexts(next, expectedRevision);
        }
        return next;
    }
}

/** Resolution remains pure after loading ordinary records, with regional parents before defaults. */
export function resourceTextSource(record: ResourceTextRecord): ContentTextSource {
    return {
        namespace: record.source.namespace,
        resolve: (requestedLocale) => {
            const locale = localeSchema.parse(requestedLocale);
            const locales = [locale];
            let parent = new Intl.Locale(locale).baseName;
            while (parent) {
                locales.push(parent);
                parent = parent.includes("-") ? parent.slice(0, parent.lastIndexOf("-")) : "";
            }
            locales.push(record.source.locale);
            return Object.fromEntries(
                record.source.texts.map((text) => {
                    for (const language of new Set(locales)) {
                        const value = record.overrides[text.id]?.[language] ?? text.values[language];
                        if (value !== undefined) {
                            return [text.id, value];
                        }
                    }
                    throw new ResourceArchiveError("Resource text default is missing");
                }),
            );
        },
    };
}
