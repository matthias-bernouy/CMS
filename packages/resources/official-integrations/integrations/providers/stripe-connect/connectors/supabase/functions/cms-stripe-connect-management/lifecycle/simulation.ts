import { HttpError, type JsonRecord } from "../core/runtime.ts";
export function localSimulation(secrets: JsonRecord): boolean {
    if (Deno.env.get("ULVIA_LOCAL_PROVIDER_SIMULATION") !== "v1") {
        return false;
    }
    const url = new URL(Deno.env.get("SUPABASE_URL") ?? "http://invalid");
    if (
        url.protocol !== "http:" ||
        !["127.0.0.1", "localhost", "[::1]", "kong", "host.docker.internal"].includes(url.hostname) ||
        !String(secrets.stripeSecretKey).startsWith("sk_test_ulvia_local_") ||
        !String(secrets.stripePublishableKey).startsWith("pk_test_ulvia_local_")
    ) {
        throw new HttpError(422, "Local provider simulation requires local runtime and synthetic Stripe credentials");
    }
    return true;
}
