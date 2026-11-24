import { capabilitiesFor, z } from "@bernouy/ulvia-sdk";
import type { WorkflowServices } from "workflows/interfaces/services";
import { WorkflowInstallations } from "workflows/definitions/installations/service";
import { command, binding, id, revision } from "../schemas";
import { revisionInput } from "./schemas";
const define = capabilitiesFor<WorkflowServices>();
export const publish = define({
    ...command,
    id: "installations.publish",
    bindings: [binding("POST", "/installations/publish")],
    input: revisionInput,
    output: z.strictObject({ workflowId: id, revision, digest: id }),
    execute: async ({ services, context, input }) => {
        await services.authority.administrator(context);
        return new WorkflowInstallations(services).publish(input.installationId, input.expectedRevision);
    },
});
export const remove = define({
    ...command,
    id: "installations.remove",
    bindings: [binding("POST", "/installations/remove")],
    input: revisionInput,
    output: z.strictObject({ removed: z.boolean() }),
    execute: async ({ services, context, input }) =>
        new WorkflowInstallations(services).remove(
            input.installationId,
            input.expectedRevision,
            await services.authority.administrator(context),
        ),
});
