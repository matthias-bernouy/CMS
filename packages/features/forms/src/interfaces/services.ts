import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { SubmissionRecord, FormEventIntent } from "forms/interfaces/repository";
import type { FormsService } from "forms/core/FormsService";
import type { SubmissionService } from "forms/core/SubmissionService";

export interface FormsServices {
    forms: FormsService;
    captureInitiator?(context: ProviderCapabilityInvocationContext, occurrenceId: string): Promise<string | undefined>;
    submissions: SubmissionService;
    principal(context: {
        actorKind?: string;
        subjectId?: string;
        sourceInstallationId?: string;
        systemServiceId?: string;
        connectionId?: string;
    }): string;
}
/** The intent is inserted in the same document as the accepted answers. */
export interface FormsSubmissionEvents {
    prepare(causation: readonly string[], initiatorProof?: string): Promise<FormEventIntent | null>;
    publish(record: SubmissionRecord): Promise<void>;
}
