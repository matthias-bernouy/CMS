import { domainSource as createSource } from "./fixture";
import { draft, answers, fields } from "../../../../packages/features/forms/tests/fixtures";
import { submissionValues, validateAnswers } from "@bernouy/forms";
import type { WorkflowContext } from "./context";
import type { Variant } from "../../capabilities/types";
/** Large/history profiles retain real resource catalogs; their history must not duplicate event type metadata. */
export async function domainSource(context: WorkflowContext, variant: Variant) {
    const selected = await createSource(context);
    if (["large", "history"].includes(variant)) {
        for (let index = 0; index < (variant === "large" ? 100 : 40); index++) {
            const formId = crypto.randomUUID();
            await selected.forms.call("forms.create", {
                formId,
                draft: { ...draft, notification: { ...draft.notification, enabled: false } },
            });
            await selected.forms.call("forms.publish", { formId, expectedRevision: 1 });
        }
        if (variant === "history") {
            for (let revision = 2; revision <= 8; revision++) {
                await selected.forms.call("forms.publish", { formId: selected.formId, expectedRevision: revision });
            }
        }
    }
    const resource = await context.fresh.fixture(
        "forms.describe-submission",
        { selectorJson: selected.selectorJson },
        "ulvia/cms.forms",
    );
    const validated: readonly unknown[] = answers;
    validateAnswers(draft.fields, validated);
    return {
        ...selected,
        resource,
        payloadJson: JSON.stringify({
            formId: selected.formId,
            formVersion: Number(resource.version),
            submissionId: crypto.randomUUID(),
            receivedAt: new Date().toISOString(),
            answers: submissionValues(draft.fields, validated),
        }),
    };
}
