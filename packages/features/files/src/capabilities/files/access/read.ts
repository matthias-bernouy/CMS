import { defineCapability } from "files/capabilities/define";
import { binaryResponse } from "files/capabilities/files/access/binary";
import { readFileInputSchema, readFileOutputSchema } from "files/schemas/files";
import { readFileErrors as errors } from "files/schemas/errors";

export const readFile = defineCapability({
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    id: "files.read",
    description: "Stream one immutable public or signed private file generation.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/files/{fileId}/{generation}",
            input: {
                path: { fileId: "fileId", generation: "generation" },
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
    input: readFileInputSchema,
    output: readFileOutputSchema,
    errors,
    execute: async ({ input, services }) =>
        binaryResponse(
            await services.files.readFile({
                ...input,
                access: input.access ?? undefined,
                range: input.range ?? undefined,
                ifRange: input.ifRange ?? undefined,
            }),
        ),
});
