import { expect, test } from "bun:test";
import {
    parseProviderGatewayRegistrationRequestJson,
    parseProviderInstallationJson,
    parseProviderRuntimeReportJson,
} from "@bernouy/cms-providers/installations";

test("connection fixtures describe consistent identities and distinct exact runtime releases", async () => {
    const directory = new URL("../../fixtures/protocol-v1/connection/", import.meta.url);
    const installation = parseProviderInstallationJson(await Bun.file(new URL("installation.json", directory)).text());
    const report = parseProviderRuntimeReportJson(await Bun.file(new URL("report.json", directory)).text());
    const registration = parseProviderGatewayRegistrationRequestJson(
        await Bun.file(new URL("registration.json", directory)).text(),
    );
    expect(installation.accountId).toBe(report.account.id);
    expect(installation.providerId).toBe(report.providerId);
    expect(installation.approval.manifestDigest).toBe(report.manifest.digest);
    expect(installation.approval.manifestVersion).toBe(report.manifest.version);
    expect(registration.installationId).toBe(installation.id);
    expect(report.implementations.map((entry) => entry.version)).toEqual(["1.0.0", "2.0.0"]);
});
