import { describe, expect, test } from "bun:test";
import { SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY } from "@bernouy/cms-integrations";
import getConnectorProvider from "cms-control/api/_platform/integrations/connector-provider.get";
import postConnectorProvider from "cms-control/api/_platform/integrations/connector-provider.post";
import { fixture, jsonRequest } from "./support";

describe("connector provider settings API", () => {
    test("GET returns Supabase status without exposing the token or its secret key", async () => {
        const { cms, secrets } = fixture({ enabled: true, projectRef: "abcdefghijklmnopqrst" });
        await secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, "sbp_super_secret");
        secrets.get = async () => {
            throw new Error("GET settings must not read the raw access token");
        };

        const response = await getConnectorProvider(
            new Request("http://localhost/api/integrations/connector-provider"),
            cms,
        );
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

        const response = await getConnectorProvider(
            new Request("http://localhost/api/integrations/connector-provider"),
            cms,
        );

        expect(await response.json()).toEqual({
            provider: "supabase",
            enabled: false,
            projectRef: "",
            accessTokenConfigured: false,
        });
    });

    test("POST stores a trimmed write-only access token and enables Supabase", async () => {
        const { cms, providers, secrets } = fixture();

        const response = await postConnectorProvider(
            jsonRequest({
                provider: "supabase",
                enabled: true,
                projectRef: " abcdefghijklmnopqrst ",
                accessToken: " sbp_new_token ",
            }),
            cms,
        );
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

        const response = await postConnectorProvider(
            jsonRequest({
                provider: "supabase",
                enabled: true,
                projectRef: "new-project-reference",
                accessToken: "",
            }),
            cms,
        );

        expect(response.status).toBe(200);
        expect(await readSecret(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY)).toBe("sbp_existing");
        expect(await response.json()).toEqual({
            provider: "supabase",
            enabled: true,
            projectRef: "new-project-reference",
            accessTokenConfigured: true,
        });
    });
});
