import type { FormDraft } from "forms/application/schemas/authoring";
import type { SubmissionInput } from "forms/application/schemas/public";

/** One immutable content snapshot shared by the submission's fixed recipient intents. */
export interface FormsNotification {
    readonly subject: string;
    readonly text: string;
}
/** Receives a published draft and validated answers; performs no delivery or persistence. */
export type FormsNotificationComposer = (
    draft: FormDraft,
    input: SubmissionInput,
    id: string,
    receivedAt: string,
) => FormsNotification;
