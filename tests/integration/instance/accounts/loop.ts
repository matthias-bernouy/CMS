import { expect } from "bun:test";
import type { WorkflowDefinition } from "@bernouy/workflows";
import type { repositoryApi } from "../repository/client";
import type { SmtpService } from "../../../performance/harness/services/smtp/client";
import type { AccountCall } from "./workflows";
import { activate, succeededRuns } from "./workflows";
export async function checkCausalLoop(call: AccountCall, api: ReturnType<typeof repositoryApi>, smtp: SmtpService) {
    const definition: WorkflowDefinition = {
        format: "ulvia-workflow/v1",
        inputSchema: { type: "object", properties: {} },
        parametersSchema: { type: "object", properties: {} },
        outputSchema: { type: "boolean" },
        trigger: { kind: "event", contractId: "ulvia/cms.access", eventType: "account.created" },
        entry: "create-child",
        steps: [
            {
                id: "create-child",
                kind: "call",
                target: { contractId: "ulvia/cms.access", capabilityId: "signup" },
                input: {
                    kind: "literal",
                    value: { email: "child@performance.test", password: "Child-strong-password-123!" },
                },
                next: null,
                onError: {},
            },
        ],
        output: { kind: "literal", value: true },
    };
    await activate(call, "causal-loop", definition);
    const response = await api.request("ulvia/cms.access", "/signup", "POST", {
        email: "parent@performance.test",
        password: "Parent-strong-password-123!",
    });
    expect(response.status).toBe(200);
    await succeededRuns(call, "causal-loop", 1);
    await Bun.sleep(6500);
    await succeededRuns(call, "causal-loop", 1);
    expect((await smtp.control.mailbox("child@performance.test")).messages).toHaveLength(1);
}
