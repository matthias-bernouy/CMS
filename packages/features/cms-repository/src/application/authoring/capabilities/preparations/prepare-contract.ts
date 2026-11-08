import { defineCapability } from "cms-repository/application/authoring/capabilities/define";
import {
    prepareInputSchema,
    prepareContractOutputSchema,
} from "cms-repository/application/authoring/schemas/preparations";
import { authoringErrors as errors } from "cms-repository/application/authoring/schemas/errors";
import { prepareCandidate } from "cms-repository/application/authoring/core/preparation";
import { requiredText } from "cms-repository/application/authoring/core/input";
export const prepareContract = defineCapability({
    id: "prepare-contract",
    description: "Validate and prepare contract source files without publication or installation.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/prepare-contract",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "authoring_prepare_contract",
                description: "Validate and prepare contract source files without publication or installation.",
            },
        },
    ],
    docs: ["overview.md", "artifact-authoring.md", "contract-source.md"],
    input: prepareInputSchema,
    output: prepareContractOutputSchema,
    errors,
    execute: ({ services, input }) => prepareCandidate(services.authoring, "contract", requiredText(input.sourceJson)),
});
