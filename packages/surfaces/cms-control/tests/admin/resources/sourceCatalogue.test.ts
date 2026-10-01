import { expect, test } from "bun:test";
import type { RepositoryArtifactEntry } from "@bernouy/cms-repository/providers/sources";
import { renderSourceCatalogue } from "cms-control/components/admin/Resources/Sources/catalogue";
import {
    type SourceCatalogue,
    type SourceInstallations,
    sourceUpgrade,
    sourceUpgradeNote,
} from "cms-control/components/admin/Resources/Sources/model";

const release = (version: string, digest: string): RepositoryArtifactEntry => ({
    repositoryId: "local",
    kind: "contract",
    publisherId: "ulvia.official",
    id: "forms.submissions",
    version,
    digest,
    name: "Form submissions",
    description: "Submit public forms and read their receipts.",
    icon: "feedback",
    categories: ["feedback", "forms"],
    publishedAt: "2026-09-30T10:00:00.000Z",
});

const catalogue: SourceCatalogue = {
    repositories: ["local"],
    available: [release("0.1.0", "sha256:one"), release("0.2.0", "sha256:two")],
};

const selected = {
    installationId: "provider-1",
    contractId: "forms.submissions",
    version: "0.1.0",
    digest: "sha256:one",
};

test("source cards present discovery metadata without technical release noise", () => {
    const host = document.createElement("div");
    const state: SourceInstallations = {
        selected: [selected],
        installations: [
            {
                id: "provider-1",
                providerId: "official",
                accountId: "main",
                status: "enabled",
                observedAt: null,
                contracts: [
                    {
                        contractId: "forms.submissions",
                        version: "0.1.0",
                        digest: "sha256:one",
                        status: "ready",
                    },
                ],
            },
        ],
    };

    expect(renderSourceCatalogue(host, catalogue, state, "forms")).toBe(1);
    expect(host.querySelector('[slot="title"] h2')?.textContent).toBe("Form submissions");
    expect(host.querySelector('[slot="description"]')?.textContent).toContain("Submit public forms");
    expect(host.querySelector(".source-card-publisher")?.textContent).toBe("By Ulvia");
    expect(host.querySelector(".source-certified-badge")?.getAttribute("aria-label")).toBe(
        "Certified official Ulvia contract",
    );
    expect(host.querySelector(".source-card-categories")?.textContent).toBe("FeedbackForms");
    expect(host.querySelector('[slot="meta"]')?.textContent).toBe("Updated Sep 30, 2026");
    expect(host.textContent).not.toContain("0.2.0");
    expect(host.textContent).not.toContain("forms.submissions");
    expect(host.querySelector('[slot="actions"]')?.textContent).toBe("Manage source");
});

test("upgrade state distinguishes repository availability from provider readiness", () => {
    const unavailable: SourceInstallations = {
        selected: [selected],
        installations: [],
    };
    const repositoryOnly = sourceUpgrade(catalogue, unavailable, selected);
    expect(repositoryOnly.latestRepository?.version).toBe("0.2.0");
    expect(repositoryOnly.readyRelease).toBeUndefined();
    expect(sourceUpgradeNote(selected, repositoryOnly)).toBe(
        "Repository release v0.2.0 is available, but no connected provider reports it ready.",
    );

    const ready: SourceInstallations = {
        selected: [selected],
        installations: [
            {
                id: "provider-2",
                providerId: "official",
                accountId: "next",
                status: "enabled",
                observedAt: null,
                contracts: [
                    {
                        contractId: "forms.submissions",
                        version: "0.2.0",
                        digest: "sha256:two",
                        status: "ready",
                    },
                ],
            },
        ],
    };
    const offered = sourceUpgrade(catalogue, ready, selected);
    expect(offered.readyRelease?.version).toBe("0.2.0");
    expect(offered.readyProvider?.accountId).toBe("next");
});
