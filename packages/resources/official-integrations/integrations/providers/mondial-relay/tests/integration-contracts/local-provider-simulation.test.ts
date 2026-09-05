import { describe, expect, test } from "bun:test";
import { localProviderSimulationEnabled } from "../../connectors/supabase/functions/cms-delivery/env.ts";

describe("local Mondial Relay provider simulation", () => {
    const environment = (marker = "v1", supabaseUrl = "http://kong:8000") => {
        const values: Record<string, string> = {
            ULVIA_LOCAL_PROVIDER_SIMULATION: marker,
            SUPABASE_URL: supabaseUrl,
            MONDIAL_RELAY_CONNECT_LOGIN: "local-login",
            MONDIAL_RELAY_CONNECT_PASSWORD: "local-password",
            MONDIAL_RELAY_CONNECT_CUSTOMER_ID: "local-customer",
        };
        return (name: string): string => values[name] ?? "";
    };

    test("requires the private marker and local-only credentials together", () => {
        expect(localProviderSimulationEnabled(environment())).toBe(true);
        expect(localProviderSimulationEnabled(environment(""))).toBe(false);
        expect(localProviderSimulationEnabled(environment("v1", "https://project.supabase.co"))).toBe(false);
        expect(
            localProviderSimulationEnabled((name) =>
                name === "MONDIAL_RELAY_CONNECT_LOGIN" ? "production-login" : environment()(name),
            ),
        ).toBe(false);
    });
});
