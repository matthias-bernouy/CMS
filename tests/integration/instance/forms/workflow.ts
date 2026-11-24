import { expect } from "bun:test";
import type { WorkflowDefinition } from "@bernouy/workflows";
import { formSubmissionEmail } from "@bernouy/official-workflows";
import type { SmtpService } from "../../../performance/harness/services/smtp/client";

type Call = (path: string, input: unknown, method: "POST" | "QUERY", contractId: string) => Promise<any>;
/** Use the ordinary admitted API: automatic engine selection, resource resolution and pushed delivery. */
export async function prepareContactWorkflow(call: Call, formId: string, smtp: SmtpService) {
    const contractId = "ulvia/cms.workflows";
    const templateId = crypto.randomUUID();
    await call(
        "/email-templates/create",
        {
            id: templateId,
            name: "Submission notification",
            description: "Journey notification",
            locale: "en",
            draft: {
                subject: "Contact form message",
                text: "Submission {{submissionId}} for {{formId}} at {{receivedAt}}",
                variables: ["submissionId", "formId", "receivedAt"].map((name) => ({
                    name,
                    kind: "text",
                    required: true,
                })),
            },
        },
        "POST",
        "ulvia/cms.email-templates",
    );
    await call(
        "/email-templates/publish",
        { id: templateId, expectedRevision: 1 },
        "POST",
        "ulvia/cms.email-templates",
    );
    const definition: WorkflowDefinition = formSubmissionEmail.definition;
    await call(
        "/definitions/create",
        {
            workflowId: "contact",
            definitionJson: JSON.stringify(definition),
            parametersJson: JSON.stringify({
                formId,
                recipient: "workflow@performance.test",
                templateId,
                templateVersion: 1,
            }),
        },
        "POST",
        contractId,
    );
    expect(
        await call("/definitions/validate", { workflowId: "contact", expectedRevision: 1 }, "QUERY", contractId),
    ).toMatchObject({ valid: true });
    await call("/definitions/publish", { workflowId: "contact", expectedRevision: 1 }, "POST", contractId);
    await call(
        "/triggers/create",
        { triggerId: "contact", workflowId: "contact", publishedRevision: 1 },
        "POST",
        contractId,
    );
    return async (expected = 1) => {
        let mailbox = await smtp.control.mailbox("workflow@performance.test");
        let runs: { workflowId: string; status: string }[] = [];
        for (let tries = 0; tries < 350; tries++) {
            mailbox = await smtp.control.mailbox("workflow@performance.test");
            const page = await call("/runs/list", { limit: 100 }, "QUERY", contractId);
            runs = page.items.filter((run: { workflowId: string }) => run.workflowId === "contact");
            if (
                mailbox.messages.length === expected &&
                runs.length === expected &&
                runs.every((run) => run.status === "succeeded")
            ) {
                break;
            }
            await Bun.sleep(100);
        }
        expect(mailbox.messages).toHaveLength(expected);
        expect(mailbox.messages[0]!.raw).toContain("Contact form message");
        expect(runs).toHaveLength(expected);
        expect(runs.every((run) => run.status === "succeeded")).toBe(true);
    };
}
