import { z } from "zod";
import { defineTenantConfig } from "@bernouy/tenant-provisioner-sdk";

/**
 * Provider-owned tenant config (base.md §11). One zod schema = one source of
 * truth: `defineTenantConfig` emits the JSON Schema with `x-*` annotations
 * for the hub UI AND keeps `.zod` + `.partial` available for server-side
 * validation in hooks and handlers.
 */
const NotesShape = z.object({
    maxNotes:     z.number().int().min(1).max(100).default(10),
    allowEmoji:   z.boolean().default(true),
    secretApiKey: z.string().optional(),
});

export const NOTES_TENANT_CONFIG = defineTenantConfig({
    version: "1.0",
    zod:     NotesShape,
    title:   "notes-provider tenant config",
    defaultWritableBy: ["control-plane", "tenant"],
    annotations: {
        maxNotes: {
            title:  "Max notes per tenant",
            widget: "slider",
            group:  "Limits",
        },
        allowEmoji: {
            title:  "Allow emoji in notes",
            widget: "toggle",
            group:  "Content",
        },
        secretApiKey: {
            title:      "Secret API key (hub-only)",
            writeOnly:  true,
            writableBy: ["control-plane"],
            group:      "Secrets",
        },
    },
});

export type NotesConfig = z.infer<typeof NotesShape>;
