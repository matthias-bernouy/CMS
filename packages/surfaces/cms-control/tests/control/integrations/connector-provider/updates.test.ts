import { describe, expect, test } from "bun:test";
import { SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY } from "@bernouy/cms-integrations";
import getConnectorProvider from "cms-control/api/_platform/integrations/_provider/connector-provider.get";
import postConnectorProvider from "cms-control/api/_platform/integrations/_provider/connector-provider.post";
import { fixture, jsonRequest } from "./support";

describe("connector provider settings API", () => {
    test("accepts URL-encoded form values and uses the checked enabled value", async () => {
        const { cms, providers, secrets } = fixture();
        const body = new URLSearchParams();
        body.append("provider", "supabase");
        body.append("enabled", "false");
        body.append("enabled", "true");
        body.append("projectRef", "abcdefghijklmnopqrst");
        body.append("accessToken", "sbp_form_token");

        const response = await postConnectorProvider(
            new Request("http://localhost/api/integrations/connector-provider", {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded" },
                body,
            }),
            cms,
        );

        expect(response.status).toBe(200);
        expect((await providers.get("supabase"))?.enabled).toBe(true);
        expect(await secrets.get(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY)).toBe("sbp_form_token");
    });

    test("rejects enabling Supabase without a project reference or configured token", async () => {
        const { cms, providers } = fixture();

        await expect(
            postConnectorProvider(
                jsonRequest({
                    provider: "supabase",
                    enabled: true,
                    projectRef: "",
                    accessToken: "sbp_token",
                }),
                cms,
            ),
        ).rejects.toThrow(/projectRef.*required/);
        await expect(
            postConnectorProvider(
                jsonRequest({
                    provider: "supabase",
                    enabled: true,
                    projectRef: "abcdefghijklmnopqrst",
                    accessToken: "",
                }),
                cms,
            ),
        ).rejects.toThrow(/accessToken.*required/);
        expect(await providers.get("supabase")).toBeNull();
    });

    test("rejects connector provider kinds other than Supabase", async () => {
        const { cms } = fixture();
        await expect(
            postConnectorProvider(
                jsonRequest({
                    provider: "other",
                    enabled: false,
                    projectRef: "",
                }),
                cms,
            ),
        ).rejects.toThrow(/provider.*supabase/);
    });
});
