import type { Collection } from "mongodb";
import type { RoleDefinition } from "cms-permissions/core/permissions";
import { defaultRoleDefinitions } from "cms-permissions/core/permissions";
import type { RolesRepository } from "cms-permissions/interfaces/RolesRepository";

type RoleDocument = {
    _id:      string;   // role id
    label:    string;
    builtin?: boolean;
    grants:   RoleDefinition["grants"];
};

const toDef = (d: RoleDocument): RoleDefinition => ({ id: d._id, label: d.label, ...(d.builtin ? { builtin: true } : {}), grants: d.grants });
const toDoc = (r: RoleDefinition): RoleDocument => ({ _id: r.id, label: r.label, ...(r.builtin ? { builtin: true } : {}), grants: r.grants });

/**
 * Mongo-backed `RolesRepository`. `init()` seeds the editable built-ins
 * (`user`, `public`) if absent — idempotent, never overwrites an edited
 * built-in's grants. One collection (typically `roles`).
 */
export class MongoRolesRepository implements RolesRepository {
    constructor(private readonly col: Collection<RoleDocument>) {}

    /** Seed the built-ins if absent. Idempotent; safe to call on every boot. */
    async init(): Promise<void> {
        for (const d of defaultRoleDefinitions()) {
            await this.col.updateOne({ _id: d.id }, { $setOnInsert: toDoc(d) }, { upsert: true });
        }
    }

    async list(): Promise<RoleDefinition[]> {
        return (await this.col.find({}).toArray()).map(toDef);
    }

    async get(id: string): Promise<RoleDefinition | null> {
        const d = await this.col.findOne({ _id: id });
        return d ? toDef(d) : null;
    }

    async upsert(def: RoleDefinition): Promise<void> {
        await this.col.replaceOne({ _id: def.id }, toDoc(def), { upsert: true });
    }

    async delete(id: string): Promise<void> {
        await this.col.deleteOne({ _id: id });
    }
}
