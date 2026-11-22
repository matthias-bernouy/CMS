import type { FormsService } from "forms/core/FormsService";
import type { SubmissionService } from "forms/core/SubmissionService";

export interface FormsServices {
    forms: FormsService;
    submissions: SubmissionService;
    principal(context: {
        actorKind?: string;
        subjectId?: string;
        sourceInstallationId?: string;
        systemServiceId?: string;
        connectionId?: string;
    }): string;
}
export interface FormsDelivery {
    available(): Promise<boolean>;
    send(
        input: { toEmail: string; subject: string; text: string },
        key: string,
    ): Promise<"accepted" | "blocked" | "failed" | "unknown">;
}
