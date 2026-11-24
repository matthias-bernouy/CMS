import type {
    FormDraft,
    FormRecord,
    FormVersion,
    ListInput,
    ListOutput,
    PublishAck,
} from "forms/application/schemas/authoring";
import type { SubmissionInput } from "forms/application/schemas/public";
import type { SubmissionListInputDto, SubmissionStatus } from "forms/application/schemas/submissions";
export interface FormEventIntent {
    readonly initiatorProof: string | null;
    readonly installationId: string;
    readonly definitionId: string;
    readonly causation: readonly string[];
    readonly state: "pending" | "sending" | "accepted" | "failed";
    readonly attempts: number;
    readonly token: string | null;
    readonly dueAt: string | null;
}
export interface SubmissionRecord {
    event: FormEventIntent | null;
    receiptId: string;
    formId: string;
    formVersion: number;
    principal: string;
    digest: string;
    receivedAt: string;
    expiresAt: string;
    replayExpiresAt: string;
    status: SubmissionStatus;
    revision: number;
    answers: SubmissionInput["answers"];
    deleted: boolean;
    lastAdmin: { revision: number; digest: string } | null;
}
type SubmissionPage = {
    submissions: { id: string; formVersion: number; receivedAt: string; status: SubmissionStatus }[];
    next?: string;
};
export interface FormsRepository {
    create(formId: string, draft: FormDraft, principal: string): Promise<{ formId: string; revision: number }>;
    get(formId: string): Promise<FormRecord>;
    list(input: ListInput): Promise<ListOutput>;
    change(
        formId: string,
        revision: number,
        change: { draft?: FormDraft; availability?: "open" | "closed" | "archived" },
    ): Promise<FormRecord>;
    publish(formId: string, revision: number): Promise<PublishAck>;
    version(formId: string, version: number): Promise<FormVersion>;
    admit(formId: string): Promise<void>;
    replay(receiptId: string): Promise<SubmissionRecord | undefined>;
    insert(record: SubmissionRecord): Promise<SubmissionRecord>;
    submission(receiptId: string): Promise<SubmissionRecord>;
    submissions(input: SubmissionListInputDto): Promise<SubmissionPage>;
    replace(record: SubmissionRecord, revision: number): Promise<boolean>;
    due(limit: number): Promise<SubmissionRecord[]>;
}
