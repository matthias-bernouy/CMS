import { draftSchema, revisionSchema, uuidSchema } from "forms/application/schemas/authoring";
import type {
    AvailabilityInput,
    CasInput,
    CreateInput,
    UpdateInput,
    ListInput,
} from "forms/application/schemas/authoring";
import { validateFields } from "forms/core/validation";
import { validRequest } from "forms/core/inputBounds";
import { FormsError } from "forms/core/errors";
import type { FormsRepository } from "forms/interfaces/repository";

export class FormsService {
    constructor(
        private readonly repository: FormsRepository,
        private readonly now = Date.now,
    ) {}
    async create(input: CreateInput, principal: string) {
        this.validate(input.draft);
        uuidSchema.parse(input.formId);
        if (!validRequest(input)) {
            throw new FormsError("INVALID_INPUT");
        }
        return this.repository.create(input.formId, input.draft, principal);
    }
    get(formId: string) {
        return this.repository.get(formId);
    }
    list(input: ListInput) {
        return this.repository.list(input);
    }
    version(formId: string, version: number) {
        return this.repository.version(formId, version);
    }
    async update(input: UpdateInput) {
        this.validate(input.draft);
        return this.repository.change(input.formId, input.expectedRevision, { draft: input.draft });
    }
    async publish(input: CasInput) {
        revisionSchema.parse(input.expectedRevision);
        const current = await this.repository.get(input.formId);
        if (current.revision !== input.expectedRevision) {
            return this.repository.publish(input.formId, input.expectedRevision);
        }
        if (current.availability === "archived") {
            throw new FormsError("FORM_CLOSED");
        }
        this.validate(current.draft);
        return this.repository.publish(input.formId, input.expectedRevision);
    }
    async availability(input: AvailabilityInput) {
        const current = await this.repository.get(input.formId);
        if (input.availability === "open" && !current.currentVersion) {
            throw new FormsError("INVALID_INPUT");
        }
        return this.repository.change(input.formId, input.expectedRevision, { availability: input.availability });
    }
    async archive(input: CasInput) {
        return this.repository.change(input.formId, input.expectedRevision, { availability: "archived" });
    }
    async publicDefinition(formId: string) {
        const form = await this.repository.get(formId);
        if (!form.currentVersion || form.availability === "archived") {
            throw new FormsError("FORM_NOT_FOUND");
        }
        const { draft } = await this.repository.version(formId, form.currentVersion);
        return {
            formId,
            formVersion: form.currentVersion,
            accessMode: draft.accessMode,
            locale: draft.locale,
            title: draft.title,
            ...(draft.description === undefined ? {} : { description: draft.description }),
            fields: draft.fields,
            messages: draft.messages,
            accepting:
                form.availability === "open" &&
                (!draft.opensAt || this.now() >= Date.parse(draft.opensAt)) &&
                (!draft.closesAt || this.now() < Date.parse(draft.closesAt)),
        };
    }
    private validate(draft: unknown) {
        const parsed = draftSchema.parse(draft);
        if (!validRequest(parsed)) {
            throw new FormsError("INVALID_INPUT");
        }
        const expiry = this.now() + parsed.retentionDays * 86400000;
        if (!Number.isSafeInteger(expiry) || expiry > Date.parse("9999-12-31T23:59:59.999Z")) {
            throw new FormsError("INVALID_INPUT");
        }
        validateFields(parsed.fields);
        for (const date of [parsed.opensAt, parsed.closesAt]) {
            if (
                date !== undefined &&
                (!/^\d{4}-/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString() !== date)
            ) {
                throw new FormsError("INVALID_INPUT");
            }
        }
        if (parsed.opensAt && parsed.closesAt && parsed.opensAt >= parsed.closesAt) {
            throw new FormsError("INVALID_INPUT");
        }
    }
}
