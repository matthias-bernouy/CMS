import { expect } from "bun:test";
import { accountCreatedEmail, accountWelcomeEmail } from "@bernouy/official-workflows";
import type { WorkflowDefinition } from "@bernouy/workflows";
export type AccountCall = (path: string, input?: unknown, method?: string, contract?: string) => Promise<any>;
export async function activate(
    call: AccountCall,
    workflowId: string,
    definition: WorkflowDefinition,
    parameters: unknown = {},
) {
    await call("/definitions/create", {
        workflowId,
        definitionJson: JSON.stringify(definition),
        parametersJson: JSON.stringify(parameters),
    });
    expect(await call("/definitions/validate", { workflowId, expectedRevision: 1 }, "QUERY")).toMatchObject({
        valid: true,
    });
    await call("/definitions/publish", { workflowId, expectedRevision: 1 });
    await call("/triggers/create", { triggerId: workflowId, workflowId, publishedRevision: 1 });
}
export async function prepareAccountWorkflows(call: AccountCall) {
    for (const [id, manifest, variables] of [
        ["team", accountCreatedEmail, ["accountRef", "provider", "createdAt"]],
        ["welcome", accountWelcomeEmail, ["accountRef", "recipientEmail", "verifiedAt", "method"]],
    ] as const) {
        const templateId = crypto.randomUUID();
        await call(
            "/email-templates/create",
            {
                id: templateId,
                name: id,
                description: "Account journey",
                locale: "en",
                draft: {
                    subject: `Account ${id}`,
                    text: "Reference {{accountRef}}",
                    variables: variables.map((name) => ({ name, kind: "text", required: true })),
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
        await activate(call, id, manifest.definition, {
            templateId,
            templateVersion: 1,
            ...(id === "team" ? { recipient: "team@performance.test" } : {}),
        });
    }
}
export async function succeededRuns(call: AccountCall, workflowId: string, expected: number) {
    let rows: { workflowId: string; status: string }[] = [];
    for (let i = 0; i < 350; i++) {
        rows = (await call("/runs/list", { limit: 100 }, "QUERY")).items.filter(
            (row: { workflowId: string }) => row.workflowId === workflowId,
        );
        if (rows.length === expected && rows.every((row) => row.status === "succeeded")) {
            return rows;
        }
        await Bun.sleep(100);
    }
    expect(rows).toHaveLength(expected);
    expect(rows.every((row) => row.status === "succeeded")).toBe(true);
    return rows;
}

export async function deactivate(call: AccountCall, triggerId: string) {
    const page = await call("/triggers/list", { limit: 100 }, "QUERY");
    const current = page.items.find((row: { id: string }) => row.id === triggerId);
    expect(current?.state).toBe("active");
    await call("/triggers/delete", { triggerId, expectedRevision: current.revision });
}
