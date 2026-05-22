import { test, expect } from "bun:test";
import infoHandler from "src/api/admin/info.get";
import type { TenantInfoProvider } from "src/types/TenantInfo";

test("admin /info: returns the provider's fields for the queried tenant", async () => {
    const tenantInfo: TenantInfoProvider = async ({ tenantId }) => ({
        fields: [{ label: "Realm issuer", value: `https://kc/realms/${tenantId}`, kind: "url" }],
    });
    const res = await infoHandler(new Request("http://x/admin/info?tenantId=acme"), { tenantInfo });
    expect(await res.json()).toEqual({
        fields: [{ label: "Realm issuer", value: "https://kc/realms/acme", kind: "url" }],
    });
});

test("admin /info: empty fields when no capability declared", async () => {
    const res = await infoHandler(new Request("http://x/admin/info?tenantId=acme"), {});
    expect(await res.json()).toEqual({ fields: [] });
});

test("admin /info: empty fields when tenantId missing", async () => {
    const tenantInfo: TenantInfoProvider = async () => ({ fields: [{ label: "x", value: "y" }] });
    const res = await infoHandler(new Request("http://x/admin/info"), { tenantInfo });
    expect(await res.json()).toEqual({ fields: [] });
});
