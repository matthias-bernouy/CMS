import { expect } from "bun:test";
import type { WorkflowDefinition } from "@bernouy/workflows";
import example from "../../../../packages/features/workflows/examples/contact-notification/definition.json";
import type { SmtpService } from "../../../performance/harness/services/smtp/client";

type Call = (path: string, input: unknown, method: "POST" | "QUERY", contractId: string) => Promise<any>;
/** Use the ordinary admitted API: automatic engine selection, resource resolution and pushed delivery. */
export async function prepareContactWorkflow(call: Call, formId: string, smtp: SmtpService) {
    const contractId = "ulvia/cms.workflows";
    const definition = example.definition as WorkflowDefinition;
    await call(
        "/definitions/create",
        {
            workflowId: "contact",
            definitionJson: JSON.stringify(definition),
            parametersJson: JSON.stringify({ formId, recipient: "workflow@performance.test" }),
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
    return async () => {
        for (
            let tries = 0;
            tries < 350 && !(await smtp.control.mailbox("workflow@performance.test")).messages.length;
            tries++
        ) {
            await Bun.sleep(100);
        }
        const mailbox = await smtp.control.mailbox("workflow@performance.test");
        expect(mailbox.messages).toHaveLength(1);
        expect(mailbox.messages[0]!.raw).toContain("Contact form message");
        const runs = await call("/runs/list", { limit: 100 }, "QUERY", contractId);
        expect(runs.items).toHaveLength(1);
        expect(runs.items[0].status).toBe("succeeded");
        const triggers = await call("/triggers/list", { limit: 100 }, "QUERY", contractId);
        await call(
            "/triggers/delete",
            { triggerId: "contact", expectedRevision: triggers.items[0].revision },
            "POST",
            contractId,
        );
    };
}
