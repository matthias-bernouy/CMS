import { describe, expect, test } from "bun:test";
import { SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY } from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import getSecretKeys from "cms-control/api/_access/secrets/keys.get";
import deleteSecret from "cms-control/api/_access/secrets/secrets.delete";
import getSecrets from "cms-control/api/_access/secrets/secrets.get";
import postSecret from "cms-control/api/_access/secrets/secrets.post";

describe("reserved connector provider secrets", () => {
    test("generic secret lists omit the Supabase connector token key and value", async () => {
        const { cms, secrets } = fixture();
        await secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, "sbp_hidden");
        await secrets.set("PUBLIC_ADMIN_SECRET", "visible-value");
        const reads: string[] = [];
        const readSecret = secrets.get.bind(secrets);
        secrets.get = async (key) => {
            reads.push(key);
            return readSecret(key);
        };

        const listResponse = await getSecrets(new Request("http://localhost/api/secrets"), cms);
        const keysResponse = await getSecretKeys(new Request("http://localhost/api/secrets/keys"), cms);
        const listText = await listResponse.text();
        const keysText = await keysResponse.text();

        expect(JSON.parse(listText)).toEqual([{ key: "PUBLIC_ADMIN_SECRET" }]);
        expect(JSON.parse(keysText)).toEqual(["PUBLIC_ADMIN_SECRET"]);
        expect(`${listText}${keysText}`).not.toContain(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY);
        expect(`${listText}${keysText}`).not.toContain("sbp_hidden");
        expect(reads).toEqual([]);
    });

    test("generic secret writes cannot replace the reserved token", async () => {
        const { cms, secrets } = fixture();
        await secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, "sbp_original");

        const response = await postSecret(
            jsonRequest({
                key: SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY,
                value: "sbp_replacement",
            }),
            cms,
        );

        expect(response.status).toBe(400);
        expect(await secrets.get(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY)).toBe("sbp_original");
        expect(await response.text()).not.toContain("sbp_replacement");
    });

    test("generic secret deletes cannot remove the reserved token", async () => {
        const { cms, secrets } = fixture();
        await secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, "sbp_original");

        const response = await deleteSecret(
            new Request(`http://localhost/api/secrets?key=${SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY}`, {
                method: "DELETE",
            }),
            cms,
        );

        expect(response.status).toBe(400);
        expect(await secrets.get(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY)).toBe("sbp_original");
    });
});

function fixture() {
    const secrets = new InMemorySecretStore();
    return { secrets, cms: { secrets } as any };
}

function jsonRequest(body: Record<string, unknown>): Request {
    return new Request("http://localhost/api/secrets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}
