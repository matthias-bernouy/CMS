import { templateInstallationId } from "./installation";
import { createHash } from "node:crypto";
import type { z } from "@bernouy/ulvia-sdk";
import type { TemplateRecord, TemplateStore, TemplateView } from "email-templates/interfaces/TemplateStore";
import {
    createInputSchema,
    updateInputSchema,
    mutationInputSchema,
    renderInputSchema,
    previewInputSchema,
    versionInputSchema,
    listInputSchema,
} from "email-templates/schemas/templates";
import { validateContent, renderContent } from "./render/content";
import { TemplateError, invalid } from "./errors";

export class EmailTemplates {
    constructor(private readonly store: TemplateStore) {}
    async get(input: { id: string }) {
        const result = await this.store.view(input.id);
        if (!result) {
            throw new TemplateError("NOT_FOUND");
        }
        return result;
    }
    list(input: z.infer<typeof listInputSchema>) {
        return this.store.list(listInputSchema.parse(input));
    }
    async create(input: z.infer<typeof createInputSchema>, origin?: TemplateView["origin"]): Promise<TemplateView> {
        input = createInputSchema.parse(input);
        if (!input.name.trim() || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(input.locale)) {
            invalid();
        }
        if (origin && input.id !== templateInstallationId(origin.consumer, origin.purpose, input.locale)) {
            invalid();
        }
        input = { ...input, draft: validateContent(input.draft) };
        const mutation = digest(input);
        const existing = await this.store.get(input.id);
        if (existing) {
            if (existing.lastMutation !== mutation || existing.revision !== 1) {
                throw new TemplateError("REVISION_CONFLICT");
            }
            return view(existing);
        }
        const record: TemplateRecord = {
            ...input,
            ...(origin ? { origin } : {}),
            format: "ulvia-email-template/v1",
            revision: 1,
            archived: false,
            latestVersion: 0,
            lastMutation: mutation,
        };
        if (!(await this.store.create(record))) {
            const concurrent = await this.record(input.id);
            if (concurrent.revision !== 1 || concurrent.lastMutation !== mutation) {
                throw new TemplateError("REVISION_CONFLICT");
            }
            return view(concurrent);
        }
        return view(record);
    }
    async updateDraft(input: z.infer<typeof updateInputSchema>) {
        input = updateInputSchema.parse(input);
        input = { ...input, draft: validateContent(input.draft) };
        if (!input.name.trim()) {
            invalid();
        }
        return this.mutate(input, (record) => ({
            ...record,
            name: input.name,
            description: input.description,
            draft: input.draft,
        }));
    }
    async publish(input: z.infer<typeof mutationInputSchema>) {
        input = mutationInputSchema.parse(input);
        const result = await this.mutate(
            input,
            (record) => {
                validateContent(record.draft);
                if (record.latestVersion === Number.MAX_SAFE_INTEGER) {
                    throw new TemplateError("COUNTER_EXHAUSTED");
                }
                return {
                    ...record,
                    latestVersion: record.latestVersion + 1,
                };
            },
            "publish",
            false,
            true,
        );
        return this.getVersion({ id: result.id, version: result.latestVersion });
    }
    archive(input: z.infer<typeof mutationInputSchema>) {
        return this.mutate(
            mutationInputSchema.parse(input),
            (record) => ({ ...record, archived: true }),
            "archive",
            true,
        );
    }
    async getVersion(input: z.infer<typeof versionInputSchema>) {
        input = versionInputSchema.parse(input);
        const publication = await this.store.publication(input.id, input.version);
        if (!publication) {
            throw new TemplateError("NOT_FOUND");
        }
        return { ...input, ...publication };
    }

    async render(input: z.infer<typeof renderInputSchema>) {
        input = renderInputSchema.parse(input);
        return renderContent((await this.getVersion({ id: input.id, version: input.version })).content, input.values);
    }
    async preview(input: z.infer<typeof previewInputSchema>) {
        input = previewInputSchema.parse(input);
        const record = await this.get({ id: input.id });
        if (record.revision !== input.expectedRevision) {
            throw new TemplateError("REVISION_CONFLICT");
        }
        return renderContent(record.draft, input.values);
    }
    private async record(id: string) {
        const record = await this.store.get(id);
        if (!record) {
            throw new TemplateError("NOT_FOUND");
        }
        return record;
    }
    private async mutate(
        input: { id: string; expectedRevision: number },
        change: (record: TemplateRecord) => TemplateRecord,
        operation = "update",
        allowArchived = false,
        publication = false,
    ) {
        const record = await this.record(input.id);
        const mutation = digest({ operation, input });
        if (record.revision === input.expectedRevision + 1 && record.lastMutation === mutation) {
            return view(record);
        }
        if (record.revision !== input.expectedRevision) {
            throw new TemplateError("REVISION_CONFLICT");
        }
        if (record.archived && !allowArchived) {
            throw new TemplateError("ARCHIVED");
        }
        if (record.revision === Number.MAX_SAFE_INTEGER) {
            throw new TemplateError("COUNTER_EXHAUSTED");
        }
        if (record.pendingPublication && !publication) {
            throw new TemplateError("CORE_UNAVAILABLE");
        }
        const next = { ...change(record), revision: record.revision + 1, lastMutation: mutation };
        const saved = publication
            ? await this.store.publish(next, record.revision)
            : await this.store.replace(next, record.revision);
        if (!saved) {
            throw new TemplateError("REVISION_CONFLICT");
        }
        return view(next);
    }
}
function view(record: TemplateRecord) {
    const { format: _format, pendingPublication: _pending, lastMutation: _lastMutation, ...result } = record;
    return structuredClone(result);
}
function digest(value: unknown) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
