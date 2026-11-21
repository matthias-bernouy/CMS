import type { TemplateRecord, TemplateStore } from "email-templates/interfaces/TemplateStore";
import { TemplateError } from "email-templates/core/errors";

export class MemoryTemplateStore implements TemplateStore {
    private readonly records = new Map<string, TemplateRecord>();
    async view(id: string) {
        const record = this.records.get(id);
        if (!record) {
            return null;
        }
        const { publications: _publications, lastMutation: _mutation, format: _format, ...view } = record;
        return structuredClone(view);
    }
    async publication(id: string, version: number) {
        const record = this.records.get(id);
        const content = record?.publications[version - 1];
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
        if (this.records.size >= 100) {
            throw new TemplateError("CAPACITY_EXCEEDED");
        }
        this.records.set(record.id, structuredClone(record));
        return true;
    }
    async replace(record: TemplateRecord, expectedRevision: number) {
        if (this.records.get(record.id)?.revision !== expectedRevision) {
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
                    publications: _publications,
                    lastMutation: _lastMutation,
                    ...summary
                }) => structuredClone(summary),
            );
        return { items, ...(selected.length > input.limit ? { next: items.at(-1)!.id } : {}) };
    }
}
