import { workflowArtifact } from "./artifacts";
import { assertCondition, requireRecord } from "../queries/types";
import { WORKFLOWS } from "./context";
import type { WorkflowContext } from "./context";
import type { PreparedSample } from "../../harness/execution/samples";
import type { Variant } from "../../capabilities/types";
export async function prepareWorkflowInstallation(
    context: WorkflowContext,
    capability: string,
    binding: string,
    variant: Variant,
): Promise<PreparedSample> {
    const reference = await workflowArtifact(context);
    const installationId = crypto.randomUUID();
    if (capability !== "installations.install") {
        const count =
            capability === "installations.list" ? (variant === "large" ? 101 : variant === "history" ? 41 : 1) : 1;
        for (let index = 0; index < count; index++) {
            await context.call("installations.install", {
                installationId: index === 0 ? installationId : crypto.randomUUID(),
                reference,
                parametersJson: "{}",
            });
        }
    }
    const input = { installationId, expectedRevision: 1 };
    const inputs: Record<string, Readonly<Record<string, unknown>>> = {
        "installations.install": { installationId, reference, parametersJson: "{}" },
        "installations.get": { installationId },
        "installations.list": { limit: 100 },
        "installations.configure": { ...input, parametersJson: "{}" },
        "installations.upgrade": { ...input, reference, parametersJson: "{}" },
        "installations.validate": input,
        "installations.publish": input,
        "installations.remove": input,
    };
    assertCondition(inputs[capability], "workflow-installation-capability-case-missing");
    let output: Readonly<Record<string, unknown>>;
    return {
        send: async () =>
            (
                await context.fresh.client(WORKFLOWS, capability, binding, inputs[capability]!, (value) => {
                    output = requireRecord(value);
                })
            ).observation,
        verify: async () => {
            if (capability === "installations.list") {
                assertCondition(
                    Array.isArray(output.items) &&
                        output.items.length === (variant === "large" ? 100 : variant === "history" ? 41 : 1),
                );
                if (variant === "large") {
                    const page = await context.call(capability, { limit: 100, cursor: output.nextCursor });
                    assertCondition(
                        Array.isArray(page.items) && page.items.length === 1,
                        "workflow-installation-pagination",
                    );
                }
            } else if (capability === "installations.validate") {
                assertCondition(output.valid === true);
            } else {
                const saved = await context.call("installations.get", { installationId });
                assertCondition(requireRecord(saved.reference).digest === reference.digest);
                if (capability === "installations.remove") {
                    assertCondition(saved.state === "removed" && output.removed === true);
                }
                if (["installations.upgrade", "installations.configure"].includes(capability)) {
                    assertCondition(saved.revision === 2);
                }
                if (capability === "installations.publish") {
                    assertCondition(saved.publishedRevision === 1 && typeof output.digest === "string");
                }
            }
        },
        close: context.fresh.close,
    };
}
