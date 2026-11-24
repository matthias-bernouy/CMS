import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { WorkflowServices } from "workflows/interfaces/services";
import { compileWorkflow } from "workflows/core/compiler";
import { parseWorkflow } from "workflows/core/parse";
import { WorkflowError } from "workflows/core/errors";
export class WorkflowDefinitions {
    constructor(private readonly services: WorkflowServices) {}
    async create(id: string, definitionJson: string, parametersJson: string) {
        if (id.startsWith("installed:")) {
            throw new WorkflowError("INVALID_INPUT");
        }
        validateSchemaValue(parseWorkflow(definitionJson).parametersSchema, parseParameters(parametersJson));
        return this.services.store.createDraft({
            id,
            definitionJson,
            parametersJson,
            revision: 1,
            publishedRevision: null,
            updatedAt: new Date(this.services.now()).toISOString(),
        });
    }
    async get(id: string) {
        const record = await this.services.store.draft(id);
        if (!record) {
            throw new WorkflowError("NOT_FOUND");
        }
        return record;
    }
    async update(id: string, revision: number, definitionJson: string, parametersJson: string) {
        const current = await this.get(id);
        if (current.revision !== revision) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        validateSchemaValue(parseWorkflow(definitionJson).parametersSchema, parseParameters(parametersJson));
        const next = {
            ...current,
            definitionJson,
            parametersJson,
            revision: revision + 1,
            updatedAt: new Date(this.services.now()).toISOString(),
        };
        if (!(await this.services.store.updateDraft(next, revision))) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        return next;
    }
    async validate(id: string, revision: number) {
        const record = await this.get(id);
        if (record.revision !== revision) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        try {
            const plan = await compileWorkflow(
                record.definitionJson,
                this.services.contracts,
                parseParameters(record.parametersJson),
            );
            return { valid: true, digest: plan.digest, issues: [] as { code: string; path: string }[] };
        } catch (error) {
            if (error instanceof WorkflowError && error.code === "INVALID_DEFINITION") {
                return { valid: false, issues: [{ code: error.code, path: error.path ?? "$" }] };
            }
            throw error;
        }
    }
    async publish(id: string, revision: number) {
        const current = await this.get(id);
        if (current.revision !== revision) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        const existing = current.publishedRevision === revision ? await this.services.store.plan(id, revision) : null;
        if (existing) {
            return { revision, digest: existing.digest };
        }
        const plan = await compileWorkflow(
            current.definitionJson,
            this.services.contracts,
            parseParameters(current.parametersJson),
        );
        if (!(await this.services.store.publish(id, revision, plan))) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        return { revision, digest: plan.digest };
    }
    async retire(id: string, revision: number) {
        if (!(await this.services.store.retire(id, revision))) {
            throw new WorkflowError("NOT_FOUND");
        }
        return { retired: true };
    }
}

function parseParameters(json: string): unknown {
    return parseStrictJson(new TextEncoder().encode(json), 1048576, 32);
}
