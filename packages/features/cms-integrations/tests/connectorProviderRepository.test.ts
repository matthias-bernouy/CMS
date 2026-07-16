import { describe, expect, test } from "bun:test";
import { isValidSecretKey } from "@bernouy/cms-secrets";
import {
    InMemoryIntegrationConnectorProviderRepository,
    SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY,
    type IntegrationConnectorProvider,
} from "@bernouy/cms-integrations";

describe("InMemoryIntegrationConnectorProviderRepository", () => {
    test("uses a valid reserved key for the Supabase access token", () => {
        expect(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY).toBe("SUPABASE_CONNECTOR_ACCESS_TOKEN");
        expect(isValidSecretKey(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY)).toBe(true);
    });

    test("upserts the single Supabase provider without sharing mutable records", async () => {
        const repository = new InMemoryIntegrationConnectorProviderRepository();
        const input: IntegrationConnectorProvider = {
            provider: "supabase",
            enabled: true,
            projectRef: "project-one",
        };

        const saved = await repository.upsert(input);
        saved.projectRef = "mutated-return";

        expect(await repository.get("supabase")).toEqual(input);

        input.projectRef = "mutated-input";
        expect(await repository.get("supabase")).toEqual({
            provider: "supabase",
            enabled: true,
            projectRef: "project-one",
        });
    });
});
