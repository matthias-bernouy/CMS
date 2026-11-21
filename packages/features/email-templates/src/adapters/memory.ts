import type { TemplateRecord, TemplateStore } from "email-templates/interfaces/TemplateStore";
import type { TemplateContent } from "email-templates/schemas/content";

export class MemoryTemplateStore implements TemplateStore {
    private readonly records = new Map<string, TemplateRecord>();
    private readonly publications = new Map<string, TemplateContent>();
    async view(id: string) {
        const record = this.records.get(id);
        if (!record) {
            return null;
        }
        const { pendingPublication: _pending, lastMutation: _mutation, format: _format, ...view } = record;
        return structuredClone(view);
    }
    async publication(id: string, version: number) {
        const record = this.records.get(id);
        const content =
            record && version <= record.latestVersion ? this.publications.get(`${id}@${version}`) : undefined;
        return record && content
            ? { locale: record.locale, archived: record.archived, content: structuredClone(content) }
            : null;
    }
    async get(id: string) {
        return structuredClone(this.records.get(id) ?? null);
    }
    async create(record: TemplateRecord) {
        if (this.records.has(record.id)) {
            return false;
        }
        this.records.set(record.id, structuredClone(record));
        return true;
    }
    async publish(record: TemplateRecord, expectedRevision: number) {
        const current = this.records.get(record.id);
        if (current?.revision !== expectedRevision) {
            return (
                current?.revision === record.revision &&
                current.latestVersion === record.latestVersion &&
                current.lastMutation === record.lastMutation
            );
        }
        this.publications.set(`${record.id}@${record.latestVersion}`, structuredClone(record.draft));
        const { pendingPublication: _pending, ...committed } = record;
        this.records.set(record.id, structuredClone(committed));
        return true;
    }
    async replace(record: TemplateRecord, expectedRevision: number) {
        const current = this.records.get(record.id);
        if (current?.revision !== expectedRevision || current.pendingPublication) {
            return false;
        }
        this.records.set(record.id, structuredClone(record));
        return true;
    }
    async list(input: Parameters<TemplateStore["list"]>[0]) {
        const selected = [...this.records.values()]
            .filter(
                (record) => (!input.after || record.id > input.after) && (input.includeArchived || !record.archived),
            )
            .sort((a, b) => (a.id < b.id ? -1 : 1))
            .slice(0, input.limit + 1);
        const items = selected
            .slice(0, input.limit)
            .map(
                ({
                    draft: _draft,
                    format: _format,
                    pendingPublication: _pending,
                    lastMutation: _lastMutation,
                    ...summary
                }) => structuredClone(summary),
            );
        return { items, ...(selected.length > input.limit ? { next: items.at(-1)!.id } : {}) };
    }
}
