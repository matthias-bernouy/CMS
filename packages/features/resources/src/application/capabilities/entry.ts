import { entryMocks } from "resources/application/mocks/entry";
import { z } from "zod";
import { defineCapability, resourceBindings } from "./policy";
import { initializationErrors, emptySchema } from "resources/application/schemas/common";
import { resourceInitialization } from "resources/application/core/authority";
export const initializationEntry = defineCapability({
    id: "initialization.entry",
    access: "public",
    description: "Read only the explicit pending setup flag for this instance.",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    input: emptySchema,
    output: z.strictObject({ pending: z.boolean() }),
    errors: initializationErrors,
    mocks: entryMocks,
    bindings: resourceBindings("entry"),
    docs: ["initialization.md"],
    execute: ({ services, context }) => resourceInitialization(services, context).entry(),
});
