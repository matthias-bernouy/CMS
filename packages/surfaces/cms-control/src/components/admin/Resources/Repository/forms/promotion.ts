import type { RepositoryVersionSelection } from "../contracts/types";
import { optionalField, RepositoryFormError, requiredField } from "./fields";

export function readRepositoryPromotion(
    form: HTMLFormElement,
    selection: RepositoryVersionSelection,
): Readonly<{
    kind: string;
    version: string;
    currentReportRevisionId: string;
    confirmation: Readonly<{ version: string; reportRevisionId: string }>;
    reason?: string;
}> {
    const version = requiredField(form, "confirmationVersion", "Version confirmation");
    const reportRevisionId = requiredField(form, "confirmationReportRevisionId", "Report confirmation");
    if (version !== selection.version) {
        throw new RepositoryFormError(`Type the exact version ${selection.version} to confirm promotion.`);
    }
    if (reportRevisionId !== selection.currentReportRevisionId) {
        throw new RepositoryFormError(
            `Type the exact current report revision ID ${selection.currentReportRevisionId} to confirm promotion.`,
        );
    }
    return {
        ...selection,
        confirmation: { version, reportRevisionId },
        ...optionalReason(form),
    };
}

function optionalReason(form: HTMLFormElement): Readonly<{ reason?: string }> {
    const reason = optionalField(form, "reason");
    return reason ? { reason } : {};
}
