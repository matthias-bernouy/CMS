import { schemaResolversFor, schemaChoicesFor, z } from "@bernouy/ulvia-sdk";
import type { FormsServices } from "forms/interfaces/services";
import { uuidSchema } from "forms/application/schemas/authoring";
import { describeSubmissionFields } from "forms/core/events/schema";
export const describeSubmission = schemaResolversFor<FormsServices>()({
    id: "forms.describe-submission",
    selector: z.strictObject({ formId: uuidSchema }),
    path: "/forms/describe-submission",
    docs: ["usage.md"],
    authorize: () => {},
    execute: async ({ input, selector, services, fail }) => {
        const formId = selector.formId;
        if (input.version !== undefined && !/^[1-9][0-9]{0,15}$/u.test(input.version)) {
            throw fail("INVALID_INPUT", { message: "The form schema request could not be completed." });
        }
        try {
            const current = await services.forms.get(formId);
            const version = input.version === undefined ? current.currentVersion : Number(input.version);
            if (!version || !Number.isSafeInteger(version)) {
                throw fail("NOT_FOUND", { message: "The form schema request could not be completed." });
            }
            const published = await services.forms.version(formId, version);
            return describeSubmissionFields(formId, version, published.draft.fields);
        } catch (error) {
            if (error && typeof error === "object" && "code" in error && error.code === "FORM_NOT_FOUND") {
                throw fail("NOT_FOUND", { message: "The form schema request could not be completed." });
            }
            if (error && typeof error === "object" && "code" in error && error.code === "NOT_FOUND") {
                throw error;
            }
            throw fail("CORE_UNAVAILABLE", { message: "The form schema request could not be completed." });
        }
    },
});

export const listSubmissionSources = schemaChoicesFor<FormsServices>()({
    id: "forms.list-submission-sources",
    path: "/forms/list-submission-sources",
    docs: ["usage.md"],
    authorize: () => {},
    execute: async ({ services, input }) => {
        const page = await services.forms.list({
            limit: input.limit,
            ...(input.cursor ? { after: input.cursor } : {}),
        });
        return {
            items: page.forms.map((form) => ({
                selectorJson: JSON.stringify({ formId: form.id }),
                label: form.title.slice(0, 512),
                available: form.currentVersion !== undefined && form.availability !== "archived",
            })),
            ...(page.next ? { nextCursor: page.next } : {}),
        };
    },
});
