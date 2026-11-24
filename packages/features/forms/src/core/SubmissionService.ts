import type { FormsSubmissionEvents } from "forms/interfaces/services";
import { fingerprint } from "forms/persistence/identity";
import { FormsError } from "forms/core/errors";
import { validateAnswers } from "forms/core/validation";
import { validRequest } from "forms/core/inputBounds";
import { submissionInputSchema } from "forms/application/schemas/public";
import type { SubmissionInput } from "forms/application/schemas/public";
import type { SubmissionListInputDto, SubmissionStatusInput } from "forms/application/schemas/submissions";
import type { FormsRepository, SubmissionRecord } from "forms/interfaces/repository";
import type { FormsService } from "forms/core/FormsService";

export class SubmissionService {
    constructor(
        private readonly repository: FormsRepository,
        private readonly forms: FormsService,
        private readonly now = Date.now,
        private readonly events?: FormsSubmissionEvents,
    ) {}
    async submit(
        raw: SubmissionInput,
        principal: string,
        access: "public" | "authenticated",
        causation: readonly string[] = [],
        captureInitiator?: () => Promise<string | undefined>,
    ) {
        const input = submissionInputSchema.parse(raw);
        if (!validRequest(raw) || input.honeypot) {
            throw new FormsError("INVALID_INPUT");
        }
        const digest = await fingerprint(input);
        principal = await fingerprint(principal);
        const prior = await this.repository.replay(input.attemptId);
        if (prior) {
            return this.ack(prior, principal, digest);
        }
        const form = await this.forms.get(input.formId);
        await this.repository.admit(input.formId);
        if (form.availability === "archived" || !form.currentVersion) {
            throw new FormsError("FORM_NOT_FOUND");
        }
        if (form.currentVersion !== input.formVersion) {
            throw new FormsError("VERSION_CONFLICT");
        }
        const { draft } = await this.forms.version(input.formId, input.formVersion);
        if (draft.accessMode !== access) {
            throw new FormsError("SUBMISSION_NOT_ALLOWED");
        }
        if (
            form.availability !== "open" ||
            (draft.opensAt && this.now() < Date.parse(draft.opensAt)) ||
            (draft.closesAt && this.now() >= Date.parse(draft.closesAt))
        ) {
            throw new FormsError("FORM_CLOSED");
        }
        validateAnswers(draft.fields, input.answers);
        const time = this.now();
        const expires = time + draft.retentionDays * 86400000;
        if (
            !Number.isSafeInteger(draft.retentionDays * 86400000) ||
            !Number.isSafeInteger(expires) ||
            time + 7 * 86400000 > Date.parse("9999-12-31T23:59:59.999Z") ||
            expires > Date.parse("9999-12-31T23:59:59.999Z") ||
            time < 0
        ) {
            throw new FormsError("INVALID_INPUT");
        }
        const receivedAt = new Date(time).toISOString();
        const event = this.events ? await this.events.prepare(causation, await captureInitiator?.()) : null;
        const record: SubmissionRecord = {
            event,
            receiptId: input.attemptId,
            formId: input.formId,
            formVersion: input.formVersion,
            principal,
            digest,
            receivedAt,
            expiresAt: new Date(expires).toISOString(),
            replayExpiresAt: new Date(time + 7 * 86400000).toISOString(),
            status: "new",
            revision: 1,
            answers: input.answers,
            deleted: false,
            lastAdmin: null,
        };
        return this.ack(await this.repository.insert(record), principal, digest);
    }
    private ack(record: SubmissionRecord, principal: string, digest: string) {
        if (record.principal !== principal || record.digest !== digest) {
            throw new FormsError("IDEMPOTENCY_CONFLICT");
        }
        if (record.deleted || Date.parse(record.expiresAt) <= this.now()) {
            throw new FormsError("SUBMISSION_GONE");
        }
        return { received: true, receiptId: record.receiptId };
    }
    async get(receiptId: string) {
        const {
            event: _event,
            principal: _principal,
            digest: _digest,
            deleted: _deleted,
            replayExpiresAt: _replay,
            lastAdmin: _admin,
            ...record
        } = await this.repository.submission(receiptId);
        return record;
    }
    list(input: SubmissionListInputDto) {
        return this.repository.submissions(input);
    }
    async status(input: SubmissionStatusInput) {
        const record = await this.repository.submission(input.receiptId);
        const digest = await fingerprint(input);
        if (record.lastAdmin?.revision === input.expectedRevision && record.lastAdmin.digest === digest) {
            return { receiptId: input.receiptId, revision: input.expectedRevision + 1 };
        }
        return this.change(record, input.expectedRevision, {
            ...record,
            status: input.status,
            lastAdmin: { revision: input.expectedRevision, digest },
        });
    }
    async delete(receiptId: string) {
        const record = await this.repository.replay(receiptId);
        if (!record) {
            throw new FormsError("SUBMISSION_GONE");
        }
        if (!record.deleted) {
            await this.change(record, record.revision, {
                ...record,
                deleted: true,
                event: null,
                answers: [],
            });
        }
        return { receiptId, deleted: true };
    }
    private async change(record: SubmissionRecord, revision: number, next: SubmissionRecord) {
        if (
            record.revision !== revision ||
            revision >= Number.MAX_SAFE_INTEGER ||
            !(await this.repository.replace({ ...next, revision: revision + 1 }, revision))
        ) {
            throw new FormsError("REVISION_CONFLICT");
        }
        return { receiptId: record.receiptId, revision: revision + 1 };
    }
}
