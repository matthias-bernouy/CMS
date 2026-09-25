import { describe, expect, test } from "bun:test";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import { InMemoryProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import {
    DEFAULT_PROVIDER_INSTALLATION_LIMITS,
    parseProviderInstallation,
} from "@bernouy/cms-repository/providers/installations";
import { InMemoryContractSelectionStore, planContractSelections } from "@bernouy/cms-repository/providers/selections";
import { installationDocument } from "../installations/fixtures";
import { contractDocument, implementation, manifestDocument, releaseCatalogue } from "../support/fixtures";
import { graphFixture, siteId } from "./fixtures";

describe("selection installation limits", () => {
    test("propagates configured installation limits through parsing, manifest validation and persistence", async () => {
        const releases = await releaseCatalogue(contractDocument("payment", "pay"));
        const release = (await releases.get("payment", "1.0.0"))!.admission;
        const manifests = new InMemoryProviderManifestCatalogue(releases);
        const admission = await admitProviderManifest(
            manifestDocument([implementation("payment", "1.0.0", release.digest)], {
                configuration: {
                    type: "object",
                    properties: { value: { type: "array", maxItems: 100, items: { type: "string", maxLength: 8000 } } },
                    required: ["value"],
                },
            }),
            releases,
        );
        await manifests.publish(admission);
        const installationLimits = { ...DEFAULT_PROVIDER_INSTALLATION_LIMITS, maxDocumentBytes: 600_000 };
        const installation = parseProviderInstallation(
            {
                ...installationDocument(),
                approval: { ...installationDocument().approval, manifestDigest: admission.digest },
                configuration: { value: Array.from({ length: 70 }, () => "a".repeat(8000)) },
            },
            installationLimits,
        );
        const selected = [
            {
                siteId,
                contractId: "payment",
                version: "1.0.0",
                digest: release.digest,
                installationId: installation.id,
            },
        ];
        const context = { releases, manifests, installations: [installation], installationLimits };
        const store = new InMemoryContractSelectionStore({
            capture: async () => ({ ...context, revision: "snapshot:1" }),
            isCurrent: async () => true,
        });
        expect((await store.replace(siteId, selected, 0)).plan.structurallyValid).toBe(true);
        await expect(
            planContractSelections(siteId, selected, { ...context, installationLimits: undefined }),
        ).rejects.toThrow("byte limit");
    });

    test("validates installation limits even with an empty graph and snapshots count limits", async () => {
        const { context, select } = await graphFixture();
        await expect(
            planContractSelections(siteId, [], {
                ...context,
                installations: [],
                installationLimits: { ...DEFAULT_PROVIDER_INSTALLATION_LIMITS, maxJsonDepth: 0 },
            }),
        ).rejects.toThrow(TypeError);
        const installationLimits = { ...DEFAULT_PROVIDER_INSTALLATION_LIMITS };
        const pending = planContractSelections(siteId, [await select("payment")], { ...context, installationLimits });
        installationLimits.maxDocumentBytes = 1;
        expect((await pending).structurallyValid).toBe(true);
    });
});
