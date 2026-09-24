import { describe, expect, test } from "bun:test";
import { validateProviderInstallation } from "@bernouy/cms-providers/installations";
import { admittedInstallation } from "./fixtures";

describe("approved provider installation validation", () => {
    test("checks exact approval, endpoint and non-secret configuration against an admitted manifest", async () => {
        const { admission, installation } = await admittedInstallation();
        expect(validateProviderInstallation(installation, admission)).toEqual(installation);
        for (const patch of [
            { providerId: "another.provider" },
            { endpoint: "https://other.example.com" },
            { approval: { ...installation.approval, manifestVersion: "2.0.0" } },
            { approval: { ...installation.approval, manifestDigest: `sha256:${"b".repeat(64)}` } },
            { configuration: {} },
            { configuration: { locale: "de" } },
            { configuration: { locale: "fr", unknown: true } },
        ]) {
            expect(() => validateProviderInstallation({ ...installation, ...patch }, admission)).toThrow();
        }
    });

    test("allows two sites to use the same remote business account through separate installations", async () => {
        const { admission, installation } = await admittedInstallation();
        const first = validateProviderInstallation(installation, admission);
        const second = validateProviderInstallation(
            {
                ...installation,
                id: "installation:SHOP_43",
                siteId: "site:STORE_2",
                providerTokenRef: "${SECOND_PROVIDER_TOKEN}",
                gatewayTokenRef: "${SECOND_GATEWAY_TOKEN}",
            },
            admission,
        );
        expect(first.accountId).toBe(second.accountId);
        expect(first.siteId).not.toBe(second.siteId);
        expect(first.id).not.toBe(second.id);
    });
});
