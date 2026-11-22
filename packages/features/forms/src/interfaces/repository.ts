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
import type { FormsNotification } from "forms/notifications/interfaces/FormsDelivery";

type NotificationState = "pending" | "sending" | "accepted" | "blocked" | "failed" | "unknown";
export interface NotificationIntent {
    email: string;
    state: NotificationState;
    generation: number;
    lease: string | null;
    deadline: string | null;
}
export interface SubmissionRecord {
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
    notification: FormsNotification | null;
    intents: NotificationIntent[];
    deleted: boolean;
    deliveryMayComplete: boolean;
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
