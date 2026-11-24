import { expect, test } from "bun:test";
import { compileWorkflow } from "@bernouy/ulvia-sdk/build";
import { formSubmissionEmail } from "../src/index";

test("the shipped notification has closed instance configuration and passes no answers to Emailer", () => {
    const admission = compileWorkflow(formSubmissionEmail);
    const definition = admission.manifest.definition;
    expect(definition.parametersSchema.required).toEqual(["formId", "recipient", "templateId", "templateVersion"]);
    expect(definition.trigger).toMatchObject({ contractId: "ulvia/cms.forms", eventType: "submission.created" });
    const references = admission.canonicalJson.match(/\/data\/[^" ]+/gu);
    expect(references?.sort()).toEqual(["/data/formId", "/data/receivedAt", "/data/submissionId"]);
    expect(admission.canonicalJson).not.toContain("@example");
    expect(admission.canonicalJson).not.toContain('"answers"');
    expect(admission.manifest.requirements.map(({ contractId }) => contractId).sort()).toEqual([
        "ulvia/cms.email-templates",
        "ulvia/cms.emailer",
        "ulvia/cms.forms",
    ]);
    expect(() =>
        compileWorkflow({
            ...formSubmissionEmail,
            requirements: formSubmissionEmail.requirements.filter(({ contractId }) => contractId !== "ulvia/cms.forms"),
        }),
    ).toThrow();
});
