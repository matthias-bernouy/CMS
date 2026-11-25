import { defineCapability, errors, query, command, http, mcp } from "forms/application/capabilities/define";
import {
    createInputSchema,
    createAckSchema,
    getInputSchema,
    getOutputSchema,
    listInputSchema,
    listOutputSchema,
    updateInputSchema,
    formSchema,
    casInputSchema,
    publishAckSchema,
    availabilityInputSchema,
} from "forms/application/schemas/authoring";
import { publicDefinitionInputSchema, publicDefinitionSchema } from "forms/application/schemas/public";

export const create = defineCapability({
    id: "forms.create-v2",
    description: "Create a closed form draft using a caller-generated stable form UUID.",
    access: "admin",
    behavior: command,
    input: createInputSchema,
    output: createAckSchema,
    errors,
    bindings: [http("POST", "/forms/v2/create"), mcp],
    execute: ({ input, services, context }) => services.forms.create(input, services.principal(context)),
});
export const get = defineCapability({
    id: "forms.get-v2",
    description: "Read a form draft and optionally one immutable publication.",
    access: "admin",
    behavior: query,
    input: getInputSchema,
    output: getOutputSchema,
    errors,
    bindings: [http("QUERY", "/forms/v2/get"), mcp],
    execute: async ({ input, services }) => ({
        ...(await services.forms.get(input.formId)),
        ...(input.version ? { publishedVersion: await services.forms.version(input.formId, input.version) } : {}),
    }),
});
export const list = defineCapability({
    id: "forms.list-v2",
    description: "List form summaries with bounded cursor pagination.",
    access: "admin",
    behavior: query,
    input: listInputSchema,
    output: listOutputSchema,
    errors,
    bindings: [http("QUERY", "/forms/v2/list"), mcp],
    execute: ({ input, services }) => services.forms.list(input),
});
export const update = defineCapability({
    id: "forms.update-draft-v2",
    description: "Replace a draft at its current revision.",
    access: "admin",
    behavior: command,
    input: updateInputSchema,
    output: formSchema,
    errors,
    bindings: [http("PUT", "/forms/v2/draft"), mcp],
    execute: ({ input, services }) => services.forms.update(input),
});
export const publish = defineCapability({
    id: "forms.publish-v2",
    description: "Publish an immutable draft snapshot. Its source revision identifies the publication.",
    access: "admin",
    behavior: command,
    input: casInputSchema,
    output: publishAckSchema,
    errors,
    bindings: [http("POST", "/forms/v2/publish"), mcp],
    execute: ({ input, services }) => services.forms.publish(input),
});
export const availability = defineCapability({
    id: "forms.set-availability-v2",
    description: "Open or close a published form.",
    access: "admin",
    behavior: command,
    input: availabilityInputSchema,
    output: formSchema,
    errors,
    bindings: [http("PUT", "/forms/v2/availability"), mcp],
    execute: ({ input, services }) => services.forms.availability(input),
});
export const archive = defineCapability({
    id: "forms.archive-v2",
    description: "Archive a form without changing retained answers.",
    access: "admin",
    behavior: command,
    input: casInputSchema,
    output: formSchema,
    errors,
    bindings: [http("POST", "/forms/v2/archive"), mcp],
    execute: ({ input, services }) => services.forms.archive(input),
});
export const publicDefinition = defineCapability({
    id: "forms.get-public-definition-v2",
    description: "Read public fields and current availability without private retention settings.",
    access: "public",
    behavior: { ...query, sensitive: false },
    input: publicDefinitionInputSchema,
    output: publicDefinitionSchema,
    errors,
    bindings: [http("QUERY", "/forms/v2/public-definition")],
    execute: ({ input, services }) => services.forms.publicDefinition(input.formId),
});
