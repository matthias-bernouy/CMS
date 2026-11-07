import { defineCapability } from "cms-files/capabilities/define";
import { fileCall } from "cms-files/capabilities/support";
import { binaryResponse } from "cms-files/capabilities/files/access/binary";
import { readFileOutputSchema } from "cms-files/schemas/files";
import { readRepresentationInputSchema } from "cms-files/schemas/representations";
import { readFileErrors as errors } from "cms-files/schemas/errors";

export const readRepresentation = defineCapability({
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    id: "representations.read",
    description: "Stream one immutable image representation.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/files/{fileId}/{generation}/representations/{profile}/{width}.webp",
            input: {
                path: { fileId: "fileId", generation: "generation", profile: "profile", width: "width" },
                query: { access: "access" },
                headers: {
                    range: { property: "range", encoding: "http-field" },
                    "if-range": { property: "ifRange", encoding: "http-field" },
                },
            },
            response: {
                successStatuses: [200, 206],
                contentTypes: [],
                errorStatuses: {
                    NOT_AUTHORIZED: 403,
                    NOT_FOUND: 404,
                    RANGE_NOT_SATISFIABLE: 416,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
    ],
    docs: ["overview.md", "site-files.md"],
    input: readRepresentationInputSchema,
    output: readFileOutputSchema,
    errors,
    execute: ({ input, services, fail }) =>
        fileCall(errors, fail, async () =>
            binaryResponse(
                await services.files.readRepresentation({
                    ...input,
                    access: input.access ?? undefined,
                    range: input.range ?? undefined,
                    ifRange: input.ifRange ?? undefined,
                }),
            ),
        ),
});
