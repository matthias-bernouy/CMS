import { createHash } from "node:crypto";
import type { WorkflowServices } from "workflows/interfaces/services";
import type { WorkflowArtifactReference, WorkflowInstallation } from "workflows/interfaces/installations";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { WorkflowError } from "workflows/core/errors";
import { WorkflowTriggers } from "../Triggers";
import { checkedArtifact, checkedParameters, installationArtifact, compileInstallation } from "./artifact";

export class WorkflowInstallations {
    constructor(private readonly services: WorkflowServices) {}
    async get(id: string) {
        const record = await this.services.installationStore.get(id);
        if (!record) {
            throw new WorkflowError("NOT_FOUND");
        }
        if (record.pendingPublication !== null) {
            await this.finishPublication(record);
            return this.services.installationStore.get(id).then((value) => value!);
        }
        return record;
    }
    async install(id: string, reference: WorkflowArtifactReference, parametersJson: string, administratorId: string) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(id)) {
            throw new WorkflowError("INVALID_INPUT");
        }
        const admission = checkedArtifact(await this.services.artifacts.read(reference), reference);
        const parameters = checkedParameters(admission.manifest, parametersJson);
        const scope = `installation:${id}`;
        const manifestRef = await this.services.values.put(
            scope,
            `manifest:${reference.digest}`,
            admission.canonicalJson,
        );
        const parametersRef = await this.services.values.put(
            scope,
            `parameters:${createHash("sha256").update(canonicalizeIJson(parameters)).digest("hex")}`,
            parameters,
        );
        return this.services.installationStore.create({
            id,
            revision: 1,
            reference: structuredClone(reference),
            workflowId: `installed:${createHash("sha256").update(id).digest("hex")}`,
            manifestRef,
            parametersRef,
            publishedRevision: null,
            pendingPublication: null,
            state: "installed",
            administratorId,
            updatedAt: new Date(this.services.now()).toISOString(),
        });
    }
    async configure(
        id: string,
        revision: number,
        parametersJson: string,
        administratorId: string,
        reference?: WorkflowArtifactReference,
    ) {
        const current = await this.get(id);
        if (current.revision !== revision || current.state !== "installed") {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        if (
            reference &&
            (reference.repositoryId !== current.reference.repositoryId ||
                reference.workflowId !== current.reference.workflowId ||
                reference.publisherId !== current.reference.publisherId)
        ) {
            throw new WorkflowError("INVALID_INPUT");
        }
        const admission = reference
            ? checkedArtifact(await this.services.artifacts.read(reference), reference)
            : await installationArtifact(this.services, current);
        const parameters = checkedParameters(admission.manifest, parametersJson);
        const next: WorkflowInstallation = {
            ...current,
            revision: revision + 1,
            reference: reference ? structuredClone(reference) : current.reference,
            manifestRef: await this.services.values.put(
                `installation:${id}`,
                `manifest:${admission.digest}`,
                admission.canonicalJson,
            ),
            parametersRef: await this.services.values.put(
                `installation:${id}`,
                `parameters:${createHash("sha256").update(canonicalizeIJson(parameters)).digest("hex")}`,
                parameters,
            ),
            administratorId,
            updatedAt: new Date(this.services.now()).toISOString(),
        };
        if (!(await this.services.installationStore.replace(next, revision))) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        return next;
    }
    async validate(id: string, revision: number) {
        const record = await this.get(id);
        if (record.revision !== revision || record.state !== "installed") {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        try {
            const plan = await compileInstallation(this.services, record);
            return { valid: true, digest: plan.digest, issues: [] as { code: string; path: string }[] };
        } catch (error) {
            if (error instanceof WorkflowError && error.code === "INVALID_DEFINITION") {
                return { valid: false, issues: [{ code: error.code, path: error.path ?? "$" }] };
            }
            throw error;
        }
    }
    async publish(id: string, revision: number) {
        const record = await this.get(id);
        if (record.revision !== revision || record.state !== "installed") {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        const existing =
            record.publishedRevision === revision ? await this.services.store.plan(record.workflowId, revision) : null;
        if (existing) {
            return { workflowId: record.workflowId, revision, digest: existing.digest };
        }
        const plan = await compileInstallation(this.services, record);
        await this.services.store.publishInstalledPlan(id, record.workflowId, revision, plan);
        if (!(await this.services.installationStore.markPublished(id, revision))) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        await this.finishPublication({ ...record, pendingPublication: revision });
        return { workflowId: record.workflowId, revision, digest: plan.digest };
    }
    async finishPublication(record: WorkflowInstallation) {
        const revision = record.pendingPublication;
        if (revision === null) {
            return;
        }
        await this.services.store.confirmInstalledPlan(record.id, record.workflowId, revision);
        await this.services.installationStore.finishPublication(record.id, revision);
    }
    async remove(id: string, revision: number, administratorId: string) {
        const current = await this.get(id);
        if (
            current.state === "removed" &&
            current.revision === revision + 2 &&
            current.administratorId === administratorId
        ) {
            return { removed: true };
        }
        if (
            current.state === "removing" &&
            current.revision === revision + 1 &&
            current.administratorId === administratorId
        ) {
            return this.finishRemoval(current);
        }
        if (current.revision !== revision || current.state !== "installed") {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        const next: WorkflowInstallation = {
            ...current,
            state: "removing",
            revision: revision + 1,
            administratorId,
            updatedAt: new Date(this.services.now()).toISOString(),
        };
        if (!(await this.services.installationStore.replace(next, revision))) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        return this.finishRemoval(next);
    }
    async finishRemoval(record: WorkflowInstallation) {
        await this.services.authority.assertAdministrator(record.administratorId);
        await this.services.store.retireInstalledPlans(record.workflowId);
        const triggers = await this.services.store.triggersForWorkflow(record.workflowId, 1001);
        if (triggers.length > 1000) {
            throw new WorkflowError("CORE_UNAVAILABLE");
        }
        for (const trigger of triggers) {
            if (trigger.state !== "deleted") {
                await new WorkflowTriggers(this.services).remove(trigger.id, trigger.revision);
            }
        }
        if (
            !(await this.services.installationStore.replace(
                {
                    ...record,
                    state: "removed",
                    revision: record.revision + 1,
                    updatedAt: new Date(this.services.now()).toISOString(),
                },
                record.revision,
            ))
        ) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        return { removed: true };
    }
    async detail(id: string) {
        const record = await this.get(id);
        const {
            manifestRef: _manifest,
            parametersRef: _parameters,
            administratorId: _administrator,
            pendingPublication: _pending,
            ...metadata
        } = record;
        const artifact = await installationArtifact(this.services, record);
        return {
            ...metadata,
            manifestJson: artifact.canonicalJson,
            parametersJson: canonicalizeIJson(
                await this.services.values.get(`installation:${id}`, record.parametersRef),
            ),
        };
    }
}
