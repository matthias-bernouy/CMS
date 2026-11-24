import { z, contractString } from "@bernouy/ulvia-sdk";
import { defineCapability } from "../define";
import { getUserErrors as errors } from "auth/application/schemas/errors";
import { AccessError } from "auth/application/core/access/errors";
export const getEventAccount = defineCapability({
    id: "get-event-account",
    description:
        "Read the minimal current contact profile for an opaque Access Event account reference. The reference grants no authority.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: z.strictObject({ accountRef: contractString({ format: "uuid", maxLength: 36 }) }),
    output: z.strictObject({
        createdAt: contractString({ format: "date-time", maxLength: 40 }),
        email: contractString({ format: "email", maxLength: 320, sensitive: true }).optional(),
    }),
    errors,
    docs: ["events.md"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/get-event-account",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    execute: async ({ services, input }) => {
        if (!services.accountEventProfiles) {
            throw new AccessError("CORE_UNAVAILABLE");
        }
        const profile = await services.accountEventProfiles.get(input.accountRef);
        if (!profile) {
            throw new AccessError("NOT_FOUND");
        }
        return profile;
    },
});
