import { createHash } from "node:crypto";
import {
    admitWorkflowManifest,
    verifyStoredWorkflowManifest,
    verifyWorkflowRequirements,
} from "@bernouy/workflows/manifest";
import type { AdmittedWorkflowManifest } from "@bernouy/workflows/manifest";
import { RepositoryRequestError } from "repository/repository/core/errors";
import { LocalArtifactFiles } from "./files";
import type { LocalContractReleases } from "../contracts";
import type { LocalRepositoryYanks } from "../yanks";

export class LocalWorkflowReleases {
    constructor(
        private readonly files: LocalArtifactFiles,
        private readonly contracts: LocalContractReleases,
        private readonly yanks?: LocalRepositoryYanks,
    ) {}
    async publish(json: string): Promise<{ added: boolean; admission: AdmittedWorkflowManifest }> {
        const admission = admitWorkflowManifest(json);
        const { workflowId, publisherId, version } = admission.manifest;
        const existing = await this.getMetadata(publisherId, workflowId, version);
        if (existing) {
            if (existing.digest !== admission.digest) {
                throw new RepositoryRequestError("REJECTED", "Workflow version already exists with different content");
            }
            return { added: false, admission: existing };
        }
        await verifyWorkflowRequirements(admission.manifest, await this.contracts.catalogue());
        return {
            added: await this.files.store("workflows", publisherId, workflowId, version, admission.canonicalJson),
            admission,
        };
    }
    async getMetadata(publisherId: string, workflowId: string, version: string) {
        const bytes = await this.files.get("workflows", publisherId, workflowId, version);
        if (!bytes) {
            return null;
        }
        const admission = verifyStoredWorkflowManifest(
            bytes.toString("utf8"),
            `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        );
        if (
            admission.manifest.workflowId !== workflowId ||
            admission.manifest.publisherId !== publisherId ||
            admission.manifest.version !== version
        ) {
            throw new RepositoryRequestError("REJECTED", "Corrupt stored workflow coordinate");
        }
        return admission;
    }
    async listMetadata() {
        const rows = await this.files.list("workflows");
        if (rows.length > 4096) {
            throw new RepositoryRequestError("REJECTED", "Workflow catalogue exceeds its reference bound");
        }
        const result = [];
        for (const row of rows) {
            if (await this.yanks?.get("workflow", row.publisherId, row.id, row.version)) {
                continue;
            }
            const admission = await this.getMetadata(row.publisherId, row.id, row.version);
            if (!admission) {
                throw new RepositoryRequestError("REJECTED", "Workflow disappeared during catalogue read");
            }
            result.push({ ...admission, publishedAt: row.publishedAt });
        }
        return result;
    }
}
