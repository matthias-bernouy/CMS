import { defineCapability } from "cms-files/capabilities/define";
import { fileCall } from "cms-files/capabilities/support";
import { binaryResponse } from "cms-files/capabilities/files/access/binary";
import { readFileInputSchema, readFileOutputSchema } from "cms-files/schemas/files";
import { readFileErrors as errors } from "cms-files/schemas/errors";

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
    execute: ({ input, services, fail }) =>
        fileCall(errors, fail, async () =>
            binaryResponse(
                await services.files.readFile({
                    ...input,
                    access: input.access ?? undefined,
                    range: input.range ?? undefined,
                    ifRange: input.ifRange ?? undefined,
                }),
            ),
        ),
});
