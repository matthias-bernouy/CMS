import { describe, expect, test } from "bun:test";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import { compareProviderManifests } from "@bernouy/cms-repository/providers/compatibility";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { contractDocument, implementation, requirement } from "../../support/fixtures";
import { manifestCatalogueFixture } from "../catalogue/fixtures";

describe("provider manifest change reports", () => {
    test("requires approval for metadata-only digest changes and separates identity changes", async () => {
        const { admission, document, contracts } = await manifestCatalogueFixture();
        const renamed = await admitProviderManifest({ ...document, name: "New display name" }, contracts);
        const report = await compareProviderManifests(admission, renamed);
        expect(report.requiresApproval).toBe(true);
        expect(report.sameIdentity).toBe(true);
        expect(report.previousDigest).toBe(admission.digest);
        expect(report.nextDigest).toBe(renamed.digest);
        expect(report.changes).toEqual([
            {
                category: "metadata",
                kind: "changed",
                path: "$.name",
                before: admission.manifest.name,
                after: "New display name",
            },
        ]);
        const other = await admitProviderManifest(
            {
                ...document,
                providerId: "another.provider",
                provenance: { publisherId: "another.publisher", publishedAt: "2026-09-24T00:00:00Z" },
            },
            contracts,
        );
        const identity = await compareProviderManifests(admission, other);
        expect(identity.sameIdentity).toBe(false);
        expect(
            identity.changes.filter((change) => change.category === "identity").map((change) => change.path),
        ).toEqual(["$.provenance.publisherId", "$.providerId"]);
    });

    test("reports endpoint, credential, configuration, build and policy details deterministically", async () => {
        const { admission, document, contracts } = await manifestCatalogueFixture();
        const next = await admitProviderManifest(
            {
                ...document,
                buildVersionRange: "^3.0.0",
                endpoint: { allowedOrigins: ["https://new.example.com"] },
                credentialSlots: [{ id: "service.token", label: "Service token", required: true, secretType: "token" }],
                configuration: {
                    type: "object",
                    properties: { region: { type: "string", maxLength: 16 } },
                    required: ["region"],
                },
                dataPolicy: { residency: ["us"], retentionPolicyUrl: "https://provider.example.com/retention" },
                recovery: {
                    restore: true,
                    relocation: true,
                    backupFormatVersion: "v1",
                    compatibleBuildRange: "^3.0.0",
                },
            },
            contracts,
        );
        const report = await compareProviderManifests(admission, next);
        expect(new Set(report.changes.map((change) => change.category))).toEqual(
            new Set(["build_range", "endpoint", "credential", "configuration", "data_policy", "recovery_policy"]),
        );
        expect(
            report.changes
                .filter((change) => change.path.startsWith("$.endpoint.allowedOrigins"))
                .map((change) => change.kind)
                .sort(),
        ).toEqual(["added", "removed"]);
        expect(
            report.changes.some((change) => change.path === "$.endpoint.defaultOrigin" && change.kind === "removed"),
        ).toBe(true);
        expect(
            report.changes.some(
                (change) => change.path === '$.configuration["properties"]["region"]' && change.kind === "added",
            ),
        ).toBe(true);
        const paths = report.changes.map((change) => change.path);
        expect(paths).toEqual([...paths].sort());
        expect(Object.isFrozen(report.changes)).toBe(true);
        const slot = report.changes.find((change) => change.category === "credential")!;
        expect(Object.isFrozen(slot.after)).toBe(true);
        const reverse = await compareProviderManifests(next, admission);
        expect(reverse.changes.find((change) => change.path === slot.path)?.kind).toBe("removed");
    });

    test("keeps requirement ranges and optionality scoped to each exact implementation", async () => {
        const { document, contracts } = await manifestCatalogueFixture();
        await contracts.publish(
            await admitContractRelease(contractDocument("communication.email", "email.message.send")),
        );
        await contracts.publish(
            await admitContractRelease(contractDocument("communication.email", "email.message.send", "1.1.0")),
        );
        await contracts.publish(
            await admitContractRelease(contractDocument("forms.submission", "form.submission.create", "1.1.0")),
        );
        const first = (await contracts.get("forms.submission", "1.0.0"))!.admission;
        const second = (await contracts.get("forms.submission", "1.1.0"))!.admission;
        const previous = await admitProviderManifest(
            {
                ...document,
                implementations: [
                    implementation("forms.submission", "1.0.0", first.digest, [
                        requirement("communication.email", "email.message.send", "^1.0.0"),
                    ]),
                    implementation("forms.submission", "1.1.0", second.digest),
                ],
            },
            contracts,
        );
        const next = await admitProviderManifest(
            {
                ...document,
                implementations: [
                    implementation("forms.submission", "1.0.0", first.digest, [
                        { ...requirement("communication.email", "email.message.send", "^1.1.0"), optional: true },
                    ]),
                ],
            },
            contracts,
        );
        const report = await compareProviderManifests(previous, next);
        expect(
            report.changes.filter((change) => change.category === "requirement").map((change) => change.path),
        ).toEqual([
            '$.implementations["forms.submission@1.0.0"].requires["communication.email/email.message.send"]["optional"]',
            '$.implementations["forms.submission@1.0.0"].requires["communication.email/email.message.send"]["versionRange"]',
        ]);
        expect(report.changes.find((change) => change.category === "implementation")?.kind).toBe("removed");
        const reverse = await compareProviderManifests(next, previous);
        expect(reverse.changes.find((change) => change.category === "implementation")?.kind).toBe("added");
        const noRequirements = await admitProviderManifest(document, contracts);
        expect(
            (await compareProviderManifests(noRequirements, next)).changes.find(
                (change) => change.category === "requirement",
            )?.kind,
        ).toBe("added");
        expect(
            (await compareProviderManifests(next, noRequirements)).changes.find(
                (change) => change.category === "requirement",
            )?.kind,
        ).toBe("removed");
    });
});
