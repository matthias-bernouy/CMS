import { z } from "zod";
import { defineTenantConfig } from "@bernouy/data-provider-sdk";

/** Provider-owned tenant config (base.md §11). For v1 the addresses DP only
 *  serves the French BAN — `country` is intentionally absent (a future
 *  expansion would add `country: enum<"FR" | "..." | …>`). */
const AddressesShape = z.object({
    maxSuggestions: z.number().int().min(1).max(15).default(5),
});

export const ADDRESSES_TENANT_CONFIG = defineTenantConfig({
    version: "1.0",
    zod:     AddressesShape,
    title:   "addresses tenant config",
    defaultWritableBy: ["control-plane", "tenant"],
    annotations: {
        maxSuggestions: {
            title:       "Nombre max de suggestions",
            description: "Combien de résultats retourner sur /autocomplete (1–15).",
            widget:      "slider",
        },
    },
});

export type AddressesConfig = z.infer<typeof AddressesShape>;
