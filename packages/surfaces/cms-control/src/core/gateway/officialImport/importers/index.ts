import { importSupabaseOfficialProvider } from "./supabase";

export const OFFICIAL_PROVIDER_IMPORTERS = {
    supabase: importSupabaseOfficialProvider,
} as const;
