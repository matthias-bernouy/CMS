import { BSON } from "mongodb";
import type { Db, Collection } from "mongodb";
import { formSchema, versionSchema, listInputSchema } from "forms/application/schemas/authoring";
import type { FormDraft, FormRecord, ListInput } from "forms/application/schemas/authoring";
import { fingerprint } from "forms/persistence/identity";
import { FormsError } from "forms/core/errors";

type FormDocument = {
    _id: string;
    record: FormRecord;
    createDigest: string;
    changeDigest: string | null;
    nonce: string;
};
type VersionDocument = {
    _id: string;
    record: { formId: string; version: number; draft: FormDraft };
    committed: boolean;
};
export class MongoForms {
    protected readonly forms: Collection<FormDocument>;
    protected readonly versions: Collection<VersionDocument>;
    constructor(protected readonly db: Db) {
        const options = {
            writeConcern: { w: "majority" as const, j: true },
            readConcern: { level: "majority" as const },
        };
        this.forms = db.collection("forms", options);
        this.versions = db.collection("form_versions", options);
    }
    async create(formId: string, draft: FormDraft, principal: string) {
        const createDigest = await fingerprint([formId, draft, principal]);
        const record: FormRecord = { id: formId, revision: 1, availability: "closed", draft };
        this.size({ _id: formId, record, createDigest, changeDigest: null, nonce: crypto.randomUUID() }, 65536);
        try {
            await this.forms.insertOne({
                _id: formId,
                record,
                createDigest,
                changeDigest: null,
                nonce: crypto.randomUUID(),
            });
        } catch (error) {
            if (!duplicate(error)) {
                throw error;
            }
            const stored = await this.forms.findOne({ _id: formId });
            if (!stored || stored.createDigest !== createDigest) {
                throw new FormsError("IDEMPOTENCY_CONFLICT");
            }
            this.checkForm(stored);
            formSchema.parse(stored.record);
            await this.forms.updateOne({ _id: formId, createDigest }, { $set: { nonce: crypto.randomUUID() } });
        }
        return { formId, revision: 1 };
    }
    async get(formId: string) {
        const item = await this.forms.findOne({ _id: formId });
        if (!item) {
            throw new FormsError("FORM_NOT_FOUND");
        }
        this.checkForm(item);
        return formSchema.parse(item.record);
    }
    async list(input: ListInput) {
        listInputSchema.parse(input);
        if (input.after && !/^[0-9a-f-]{36}$/i.test(input.after)) {
            throw new FormsError("INVALID_INPUT");
        }
        const rows = await this.forms
            .find(input.after ? { _id: { $gt: input.after } } : {}, {
                projection: {
                    _id: 0,
                    "record.id": 1,
                    "record.draft.title": 1,
                    "record.revision": 1,
                    "record.availability": 1,
                    "record.currentVersion": 1,
                },
            })
            .sort({ _id: 1 })
            .limit(input.limit + 1)
            .toArray();
        const forms = rows.slice(0, input.limit).map(({ record }) => ({
            id: record.id,
            title: record.draft.title,
            revision: record.revision,
            availability: record.availability,
            ...(record.currentVersion ? { currentVersion: record.currentVersion } : {}),
        }));
        return { forms, ...(rows.length > input.limit ? { next: forms.at(-1)!.id } : {}) };
    }
    async change(
        formId: string,
        revision: number,
        change: { draft?: FormDraft; availability?: "open" | "closed" | "archived" },
    ) {
        const current = await this.forms.findOne({ _id: formId });
        if (!current) {
            throw new FormsError("FORM_NOT_FOUND");
        }
        this.checkForm(current);
        const changeDigest = await fingerprint([revision, change]);
        if (current.record.revision === revision + 1 && current.changeDigest === changeDigest) {
            return formSchema.parse(current.record);
        }
        if (
            current.record.revision !== revision ||
            current.record.availability === "archived" ||
            revision >= Number.MAX_SAFE_INTEGER
        ) {
            throw new FormsError("REVISION_CONFLICT");
        }
        const record = formSchema.parse({ ...current.record, ...change, revision: revision + 1 });
        this.size({ ...current, record, changeDigest }, 65536);
        const result = await this.forms.updateOne(
            { _id: formId, "record.revision": revision },
            { $set: { record, changeDigest } },
        );
        if (!result.matchedCount) {
            throw new FormsError("REVISION_CONFLICT");
        }
        return record;
    }
    async publish(formId: string, revision: number) {
        const current = await this.get(formId);
        const id = `${formId}:${revision}`;
        const existing = await this.versions.findOne({ _id: id });
        if (existing) {
            this.checkVersion(existing);
        }
        if (existing?.committed || (existing && current.currentVersion === revision)) {
            await this.seal(formId, revision);
            return { formId, version: revision, revision: revision + 1 };
        }
        if (
            current.revision !== revision ||
            current.availability === "archived" ||
            revision >= Number.MAX_SAFE_INTEGER
        ) {
            throw new FormsError("REVISION_CONFLICT");
        }
        if (current.currentVersion) {
            await this.seal(formId, current.currentVersion);
        }
        const record = { formId, version: revision, draft: current.draft };
        this.size({ _id: id, record, committed: false }, 65536);
        try {
            await this.versions.insertOne({ _id: id, record, committed: false });
        } catch (error) {
            if (!duplicate(error)) {
                throw error;
            }
        }
        const updated = await this.forms.updateOne(
            { _id: formId, "record.revision": revision },
            { $set: { "record.currentVersion": revision, "record.revision": revision + 1, changeDigest: null } },
        );
        if (!updated.matchedCount && (await this.get(formId)).currentVersion !== revision) {
            if (!(await this.versions.findOne({ _id: id, committed: true }))) {
                throw new FormsError("REVISION_CONFLICT");
            }
        }
        await this.seal(formId, revision);
        return { formId, version: revision, revision: revision + 1 };
    }
    async version(formId: string, version: number) {
        let row = await this.versions.findOne({ _id: `${formId}:${version}` });
        if (row) {
            this.checkVersion(row);
        }
        if (row && !row.committed && (await this.get(formId)).currentVersion === version) {
            await this.seal(formId, version);
            row = await this.versions.findOne({ _id: row._id });
        }
        if (!row?.committed) {
            throw new FormsError("FORM_NOT_FOUND");
        }
        return versionSchema.parse(row.record);
    }
    private checkForm(item: FormDocument) {
        if (
            item._id !== item.record.id ||
            typeof item.createDigest !== "string" ||
            !/^[0-9a-f]{64}$/.test(item.createDigest) ||
            typeof item.nonce !== "string" ||
            !/^[0-9a-f-]{36}$/i.test(item.nonce) ||
            !(
                item.changeDigest === null ||
                (typeof item.changeDigest === "string" && /^[0-9a-f]{64}$/.test(item.changeDigest))
            )
        ) {
            throw new FormsError("CORE_UNAVAILABLE");
        }
    }
    private checkVersion(item: VersionDocument) {
        if (typeof item.committed !== "boolean" || item._id !== `${item.record.formId}:${item.record.version}`) {
            throw new FormsError("CORE_UNAVAILABLE");
        }
        versionSchema.parse(item.record);
    }
    protected size(value: object, limit: number) {
        if (BSON.calculateObjectSize(value) > limit) {
            throw new FormsError("INVALID_INPUT");
        }
    }
    private async seal(formId: string, version: number) {
        const result = await this.versions.updateOne({ _id: `${formId}:${version}` }, { $set: { committed: true } });
        if (!result.matchedCount) {
            throw new FormsError("CORE_UNAVAILABLE");
        }
    }
}
export function duplicate(error: unknown) {
    return !!error && typeof error === "object" && "code" in error && error.code === 11000;
}
