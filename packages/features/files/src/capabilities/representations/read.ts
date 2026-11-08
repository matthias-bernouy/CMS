import { defineCapability } from "files/capabilities/define";
import { binaryResponse } from "files/capabilities/files/access/binary";
import { readFileOutputSchema } from "files/schemas/files";
import { readRepresentationInputSchema } from "files/schemas/representations";
import { readFileErrors as errors } from "files/schemas/errors";

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
    execute: async ({ input, services }) =>
        binaryResponse(
            await services.files.readRepresentation({
                ...input,
                access: input.access ?? undefined,
                range: input.range ?? undefined,
                ifRange: input.ifRange ?? undefined,
            }),
        ),
});
