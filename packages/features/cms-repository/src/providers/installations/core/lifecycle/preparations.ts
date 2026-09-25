import type { ProviderManifestCatalogue } from "cms-repository/providers/manifests/interfaces/ProviderManifestCatalogue";
import { verifyProviderManifestAdmission } from "cms-repository/providers/manifests/core/admission/verifyProviderManifestAdmission";
import {
    DEFAULT_PROVIDER_MANIFEST_LIMITS,
    normalizeProviderManifestLimits,
    type ProviderManifestLimits,
} from "cms-repository/providers/manifests/core/limits";
import { expectString, rejectUnknownKeys } from "cms-repository/providers/manifests/core/values";
import type {
    ProviderInstallationApprovalCommand,
    ProviderInstallationClock,
    ProviderInstallationWorkflowOptions,
} from "../../interfaces/ProviderInstallationStore";
import { DEFAULT_PROVIDER_INSTALLATION_LIMITS, type ProviderInstallationLimits } from "../limits";
import { parseInstallationDocument } from "../parsing/documents";
import { validateProviderRuntimeReport } from "../reports/validateProviderRuntimeReport";
import { parseProviderRuntimeReport } from "../reports/parseProviderRuntimeReport";
import { validateCandidate } from "./candidates";
import { ProviderInstallationWorkflowError } from "./errors";
import { assertFreshPreparation, assertMaxAge, timestamp } from "./state";

export function workflowOptions(options: ProviderInstallationWorkflowOptions) {
    const maxPreparationAgeMs = options.maxPreparationAgeMs ?? 5 * 60 * 1000;
    assertMaxAge(maxPreparationAgeMs);
    const limits = Object.freeze({ ...(options.limits ?? DEFAULT_PROVIDER_INSTALLATION_LIMITS) });
    parseInstallationDocument({}, limits, (value) => value);
    const manifestLimits = normalizeProviderManifestLimits(options.manifestLimits ?? DEFAULT_PROVIDER_MANIFEST_LIMITS);
    return Object.freeze({ limits, manifestLimits, maxPreparationAgeMs });
}

export function snapshotApproval(
    command: ProviderInstallationApprovalCommand,
    limits: Readonly<ProviderInstallationLimits>,
) {
    // The envelope contains two bounded documents plus metadata, with one extra nesting level.
    // Allow six bytes per metadata character for JSON escaping, plus keys and punctuation.
    // validateProposal still applies the original budgets to each document before any await.
    const envelopeLimits = {
        ...limits,
        maxDocumentBytes: Math.min(Number.MAX_SAFE_INTEGER, 2 * limits.maxDocumentBytes + 6 * (64 + 128) + 64),
        maxJsonDepth: Math.min(Number.MAX_SAFE_INTEGER, limits.maxJsonDepth + 1),
    };
    return parseInstallationDocument(command, envelopeLimits, (record) => {
        rejectUnknownKeys(record, ["candidate", "report", "preparedAt", "approvedBy"], "$");
        return {
            candidate: record.candidate,
            report: record.report,
            preparedAt: expectString(record.preparedAt, "$.preparedAt", 64),
            approvedBy: expectString(record.approvedBy, "$.approvedBy", 128),
        };
    });
}

export async function validateApprovalCommand(
    command: ProviderInstallationApprovalCommand,
    catalogue: ProviderManifestCatalogue,
    clock: ProviderInstallationClock,
    options: ReturnType<typeof workflowOptions>,
) {
    const snapshot = snapshotApproval(command, options.limits);
    const proposal = await validateProposal(
        snapshot.candidate,
        snapshot.report,
        catalogue,
        clock,
        options.limits,
        options.manifestLimits,
    );
    assertFreshPreparation(snapshot.preparedAt, proposal.now, options.maxPreparationAgeMs);
    if (timestamp(snapshot.preparedAt) < timestamp(proposal.publishedAt)) {
        throw new ProviderInstallationWorkflowError("stale_timestamp", "Preparation predates manifest publication");
    }
    return { ...proposal, approvedBy: snapshot.approvedBy, preparedAt: snapshot.preparedAt };
}

export async function validateProposal(
    value: unknown,
    reportValue: unknown,
    catalogue: ProviderManifestCatalogue,
    clock: ProviderInstallationClock,
    limits: Readonly<ProviderInstallationLimits>,
    manifestLimits: Readonly<ProviderManifestLimits>,
    allowYanked = false,
) {
    const document = parseInstallationDocument(value, limits, (record) => record);
    const reportSnapshot = parseProviderRuntimeReport(reportValue, limits);
    const published = await catalogue.get(
        expectString(document.providerId, "$.providerId", 96),
        expectString(document.manifestVersion, "$.manifestVersion", 128),
    );
    if (!published || (!allowYanked && published.yank)) {
        throw new ProviderInstallationWorkflowError("manifest_unavailable", "The pinned manifest is absent or yanked");
    }
    const admission = await verifyProviderManifestAdmission(published.admission, manifestLimits);
    const current = await catalogue.get(admission.manifest.providerId, admission.manifest.version);
    if (!current || current.admission.digest !== admission.digest || (!allowYanked && current.yank)) {
        throw new ProviderInstallationWorkflowError(
            "manifest_unavailable",
            "The pinned manifest changed or was yanked during validation",
        );
    }
    const now = clock();
    if (timestamp(published.publishedAt) > timestamp(now)) {
        throw new ProviderInstallationWorkflowError("stale_timestamp", "The CMS clock predates manifest publication");
    }
    const candidate = validateCandidate(document, admission, now, limits);
    const report = validateProviderRuntimeReport(reportSnapshot, admission, candidate, limits);
    return { candidate, report, admission, now, publishedAt: published.publishedAt };
}
