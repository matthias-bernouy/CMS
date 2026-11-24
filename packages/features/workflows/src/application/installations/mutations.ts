import { capabilitiesFor } from "@bernouy/ulvia-sdk";
import type { WorkflowServices } from "workflows/interfaces/services";
import { WorkflowInstallations } from "workflows/definitions/installations/service";
import { command, binding, json } from "../schemas";
import { installation, installationDto, installInput, revisionInput, artifactReference } from "./schemas";
const define = capabilitiesFor<WorkflowServices>();
export const install = define({
    ...command,
    id: "installations.install",
    bindings: [binding("POST", "/installations/install")],
    input: installInput,
    output: installation,
    execute: async ({ services, context, input }) =>
        installationDto(
            await new WorkflowInstallations(services).install(
                input.installationId,
                input.reference,
                input.parametersJson,
                await services.authority.administrator(context),
            ),
        ),
});
export const configure = define({
    ...command,
    id: "installations.configure",
    bindings: [binding("POST", "/installations/configure")],
    input: revisionInput.extend({ parametersJson: json }),
    output: installation,
    execute: async ({ services, context, input }) =>
        installationDto(
            await new WorkflowInstallations(services).configure(
                input.installationId,
                input.expectedRevision,
                input.parametersJson,
                await services.authority.administrator(context),
            ),
        ),
});
export const upgrade = define({
    ...command,
    id: "installations.upgrade",
    bindings: [binding("POST", "/installations/upgrade")],
    input: revisionInput.extend({ reference: artifactReference, parametersJson: json }),
    output: installation,
    execute: async ({ services, context, input }) =>
        installationDto(
            await new WorkflowInstallations(services).configure(
                input.installationId,
                input.expectedRevision,
                input.parametersJson,
                await services.authority.administrator(context),
                input.reference,
            ),
        ),
});
