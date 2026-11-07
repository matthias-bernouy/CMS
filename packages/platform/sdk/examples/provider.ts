import { defineProvider, implementContract, z } from "@bernouy/ulvia-sdk";
import { notesFeature, createReadNoteHandler } from "./notes";
import type { ExampleNoteReader } from "./notes";

export interface NotesDependencies {
    readonly notes: ExampleNoteReader;
    readonly factoryCreated?: () => void;
}

/** All build inputs are explicit and deterministic. No adapters are constructed here. */
export function notesProviderDefinition(origin: string) {
    return defineProvider({
        providerId: "example/notes-provider",
        name: "Example notes Provider",
        version: "1.0.0",
        provenance: { publisherId: "example", publishedAt: "2026-11-07T00:00:00Z" },
        buildVersionRange: ">=1.0.0 <2.0.0",
        endpoint: { allowedOrigins: [origin], defaultOrigin: origin },
        credentialSlots: [{ id: "provider-token", label: "Provider token", required: true, secretType: "token" }],
        configuration: z.strictObject({}),
        requires: [],
        implementations: [
            implementContract(notesFeature, {
                "notes.read": (dependencies: NotesDependencies) => {
                    dependencies.factoryCreated?.();
                    return createReadNoteHandler(dependencies.notes);
                },
            }),
        ],
    });
}
