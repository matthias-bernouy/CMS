export const sourcePrefix = "/.cms/sources/";
export const functionsBaseUrl = "https://project.supabase.co/functions/v1";
export const supabaseUrl = "https://project.supabase.co";
export const stripeUrl = "https://api.stripe.com";
export const edgeFunctionUrl = new URL(
    "../../connectors/supabase/functions/cms-stripe-connect/index.ts",
    import.meta.url,
).href;
export const financialTermsHash = "a".repeat(64);
export const marketplaceTermsHash = "c".repeat(64);
export const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
