import { defineFeature, z } from "@bernouy/ulvia-sdk";
import * as forms from "forms/application/capabilities/forms";
import * as submissions from "forms/application/capabilities/submissions";
import { FormsError } from "forms/core/errors";
import { FormsValidationError } from "forms/core/validation";
export const formsFeature = defineFeature({
    contractId: "ulvia/cms.forms",
    version: "1.0.0",
    publisherId: "ulvia",
    name: "CMS Forms",
    description: "Configurable forms, retained submissions and independent email notifications.",
    catalogue: { icon: "form", categories: ["content"] },
    documents: new URL("../docs/", import.meta.url),
    capabilities: [
        forms.create,
        forms.get,
        forms.list,
        forms.update,
        forms.publish,
        forms.availability,
        forms.archive,
        forms.publicDefinition,
        submissions.submit,
        submissions.submitAuthenticated,
        submissions.get,
        submissions.list,
        submissions.status,
        submissions.retry,
        submissions.remove,
    ],
    mapError: (error) =>
        error instanceof FormsError
            ? { code: error.code, output: { message: error.code } }
            : error instanceof FormsValidationError || error instanceof z.ZodError
              ? {
                    code: "INVALID_INPUT",
                    output: {
                        message: "Invalid forms data.",
                        ...(error instanceof FormsValidationError ? { issue: error.issue } : {}),
                    },
                }
              : undefined,
});
