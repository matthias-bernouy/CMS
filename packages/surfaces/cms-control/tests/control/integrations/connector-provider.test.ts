import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationConnectorProviderRepository,
    SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import getConnectorProvider from "cms-control/api/integrations/connector-provider.get";
import postConnectorProvider from "cms-control/api/integrations/connector-provider.post";

describe("connector provider settings API", () => {
    test("GET returns Supabase status without exposing the token or its secret key", async () => {
        const { cms, secrets } = fixture({ enabled: true, projectRef: "abcdefghijklmnopqrst" });
        await secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, "sbp_super_secret");
        secrets.get = async () => {
            throw new Error("GET settings must not read the raw access token");
        };

        const response = await getConnectorProvider(new Request("http://localhost/api/integrations/connector-provider"), cms);
        const text = await response.text();

        expect(response.status).toBe(200);
        expect(JSON.parse(text)).toEqual({
            provider: "supabase",
            enabled: true,
            projectRef: "abcdefghijklmnopqrst",
            accessTokenConfigured: true,
        });
        expect(text).not.toContain("sbp_super_secret");
        expect(text).not.toContain(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY);
    });

    test("GET returns a disabled empty Supabase provider by default", async () => {
        const { cms } = fixture();

        const response = await getConnectorProvider(new Request("http://localhost/api/integrations/connector-provider"), cms);

        expect(await response.json()).toEqual({
            provider: "supabase",
            enabled: false,
            projectRef: "",
            accessTokenConfigured: false,
        });
    });

    test("POST stores a trimmed write-only access token and enables Supabase", async () => {
        const { cms, providers, secrets } = fixture();

        const response = await postConnectorProvider(jsonRequest({
            provider: "supabase",
            enabled: true,
            projectRef: " abcdefghijklmnopqrst ",
            accessToken: " sbp_new_token ",
        }), cms);
        const text = await response.text();

        expect(JSON.parse(text)).toEqual({
            provider: "supabase",
            enabled: true,
            projectRef: "abcdefghijklmnopqrst",
            accessTokenConfigured: true,
        });
        expect(text).not.toContain("sbp_new_token");
        expect(text).not.toContain(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY);
        expect(await secrets.get(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY)).toBe("sbp_new_token");
        expect(await providers.get("supabase")).toEqual({
            provider: "supabase",
            enabled: true,
            projectRef: "abcdefghijklmnopqrst",
        });
    });

    test("an empty token preserves the configured token", async () => {
        const { cms, secrets } = fixture({ enabled: true, projectRef: "old-project-reference" });
        await secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, "sbp_existing");
        const readSecret = secrets.get.bind(secrets);
        secrets.get = async () => {
            throw new Error("an empty update must not read the raw access token");
        };

        const response = await postConnectorProvider(jsonRequest({
            provider: "supabase",
            enabled: true,
            projectRef: "new-project-reference",
            accessToken: "",
        }), cms);

        expect(response.status).toBe(200);
        expect(await readSecret(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY)).toBe("sbp_existing");
        expect(await response.json()).toEqual({
            provider: "supabase",
            enabled: true,
            projectRef: "new-project-reference",
            accessTokenConfigured: true,
        });
    });

    test("accepts URL-encoded form values and uses the checked enabled value", async () => {
        const { cms, providers, secrets } = fixture();
        const body = new URLSearchParams();
        body.append("provider", "supabase");
        body.append("enabled", "false");
        body.append("enabled", "true");
        body.append("projectRef", "abcdefghijklmnopqrst");
        body.append("accessToken", "sbp_form_token");

        const response = await postConnectorProvider(new Request("http://localhost/api/integrations/connector-provider", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body,
        }), cms);

        expect(response.status).toBe(200);
        expect((await providers.get("supabase"))?.enabled).toBe(true);
        expect(await secrets.get(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY)).toBe("sbp_form_token");
    });

    test("rejects enabling Supabase without a project reference or configured token", async () => {
        const { cms, providers } = fixture();

        await expect(postConnectorProvider(jsonRequest({
            provider: "supabase",
            enabled: true,
            projectRef: "",
            accessToken: "sbp_token",
        }), cms)).rejects.toThrow(/projectRef.*required/);
        await expect(postConnectorProvider(jsonRequest({
            provider: "supabase",
            enabled: true,
            projectRef: "abcdefghijklmnopqrst",
            accessToken: "",
        }), cms)).rejects.toThrow(/accessToken.*required/);
        expect(await providers.get("supabase")).toBeNull();
    });

    test("rejects connector provider kinds other than Supabase", async () => {
        const { cms } = fixture();
        await expect(postConnectorProvider(jsonRequest({
            provider: "other",
            enabled: false,
            projectRef: "",
        }), cms)).rejects.toThrow(/provider.*supabase/);
    });
});

function fixture(initial?: { enabled: boolean; projectRef: string }) {
    const providers = new InMemoryIntegrationConnectorProviderRepository(initial
        ? { provider: "supabase", ...initial }
        : undefined);
    const secrets = new InMemorySecretStore();
    return {
        providers,
        secrets,
        cms: { integrationConnectorProviders: providers, secrets } as any,
    };
}

function jsonRequest(body: Record<string, unknown>): Request {
    return new Request("http://localhost/api/integrations/connector-provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}
