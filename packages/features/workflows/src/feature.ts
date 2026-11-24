import * as installationMutations from "workflows/application/installations/mutations";
import * as installationQueries from "workflows/application/installations/queries";
import * as installationPublication from "workflows/application/installations/publication";
import { defineFeature, z } from "@bernouy/ulvia-sdk";
import { SchemaValueError } from "@bernouy/ulvia-contracts/schema";
import * as definitions from "workflows/application/definitions";
import * as triggers from "workflows/application/triggers";
import * as runs from "workflows/application/runs";
import { receive } from "workflows/application/receive";
import { WorkflowError } from "workflows/core/errors";
export const workflowsFeature = defineFeature({
    contractId: "ulvia/cms.workflows",
    publisherId: "ulvia",
    version: "1.0.0",
    name: "CMS Workflows",
    description:
        "Admin-owned immutable workflow plans, contract event triggers and recoverable JSON capability execution.",
    catalogue: { icon: "workflow", categories: ["administration", "automation"] },
    documents: new URL("../docs/", import.meta.url),
    capabilities: [
        installationMutations.install,
        installationMutations.configure,
        installationMutations.upgrade,
        installationQueries.get,
        installationQueries.list,
        installationQueries.validate,
        installationPublication.publish,
        installationPublication.remove,
        definitions.create,
        definitions.get,
        definitions.update,
        definitions.validate,
        definitions.publish,
        definitions.retire,
        triggers.create,
        triggers.update,
        triggers.list,
        triggers.remove,
        triggers.revalidate,
        runs.start,
        runs.get,
        runs.list,
        runs.cancel,
        runs.resume,
        receive,
    ],
    mapError: (error, capability) => {
        const requested =
            error instanceof WorkflowError
                ? error.code
                : error instanceof SchemaValueError || error instanceof z.ZodError
                  ? "INVALID_INPUT"
                  : undefined;
        if (!requested) {
            return undefined;
        }
        const code = Object.hasOwn(capability.errors, requested) ? requested : "CORE_UNAVAILABLE";
        return {
            code,
            output: {
                message: "The workflow request was refused.",
                ...(code === "INVALID_DEFINITION" && error instanceof WorkflowError && error.path
                    ? { path: error.path }
                    : {}),
            },
        };
    },
});
export type { WorkflowServices } from "workflows/interfaces/services";
