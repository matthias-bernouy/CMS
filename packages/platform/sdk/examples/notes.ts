import { noteMocks } from "./mocks/notes";
import { contractString, defineFeature, defineCapability, capabilityError, z } from "@bernouy/ulvia-sdk";
import type { CapabilityHandler } from "@bernouy/ulvia-sdk";
// Feature-owned API declaration, including its HTTP/MCP bindings; dependencies are injected.
export const readNote = defineCapability({
    id: "notes.read",
    access: "authenticated",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/notes/{id}",
            input: { path: { id: "id" } },
            response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: { NOT_FOUND: 404 } },
        },
        { id: "mcp", transport: "mcp", tool: { name: "notes_read" } },
    ],
    description: "Read one note by its stable identifier.",
    input: z.strictObject({ id: contractString({ minLength: 1, maxLength: 64 }) }),
    output: z.strictObject({
        id: contractString({ minLength: 1, maxLength: 64 }),
        text: contractString({ maxLength: 4096 }),
    }),
    errors: {
        NOT_FOUND: { retryable: false, output: z.strictObject({ message: contractString({ maxLength: 200 }) }) },
    },
    docs: ["overview.md"],
    mocks: noteMocks,
});
// Feature identity and exact operation list; the Provider chooses an implementation.
export const notesFeature = defineFeature({
    contractId: "example/notes",
    name: "Example notes",
    publisherId: "example",
    version: "1.0.0",
    documents: { "overview.md": "# Notes\n\nRead one note by its exact identifier.\n" },
    capabilities: [readNote],
});
export interface ExampleNoteReader {
    read(id: string): Promise<{
        id: string;
        text: string;
    } | null>;
}
// A host injects its own implementation. This factory does not open connections during the build.
export function createReadNoteHandler(reader: ExampleNoteReader): CapabilityHandler<typeof readNote> {
    return async (input) => {
        const note = await reader.read(input.id);
        if (!note) {
            throw capabilityError(readNote, "NOT_FOUND", { message: "Note not found" });
        }
        return note;
    };
}
