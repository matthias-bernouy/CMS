import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import { DuplicateFunctionError } from "../core/errors";
import type { CmsFunction } from "../interfaces/FunctionDefinition";
import type { FunctionRepository } from "../interfaces/FunctionRepository";

export type MongoFunctionRepositoryConfig = {
    collectionPrefix?: string;
};

type FunctionDoc = Omit<CmsFunction, "id"> & { _id: string };

export class MongoFunctionRepository implements FunctionRepository {
    private readonly prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoFunctionRepositoryConfig = {},
    ) {
        this.prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await this.functions.createIndex({ method: 1 });
    }

    private get functions(): Collection<FunctionDoc> {
        return this.db.collection<FunctionDoc>(this.prefix + "functions");
    }

    async createFunction(fn: CmsFunction): Promise<CmsFunction> {
        try {
            await this.functions.insertOne(toDoc(fn) as OptionalUnlessRequiredId<FunctionDoc>);
        } catch (error) {
            if (isDuplicateKey(error)) {
                throw new DuplicateFunctionError(fn.id);
            }
            throw error;
        }
        return structuredClone(fn);
    }

    async updateFunction(fn: CmsFunction): Promise<CmsFunction | null> {
        const { id: _id, ...rest } = fn;
        const doc = await this.functions.findOneAndReplace({ _id }, rest, { returnDocument: "after" });
        return fromDoc(doc);
    }

    async deleteFunction(id: string): Promise<boolean> {
        const result = await this.functions.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    async getFunction(id: string): Promise<CmsFunction | null> {
        return fromDoc(await this.functions.findOne({ _id: id }));
    }

    async getAllFunctions(): Promise<CmsFunction[]> {
        const docs = await this.functions.find().toArray();
        return docs.map((doc) => fromDoc(doc)!);
    }
}

function toDoc(fn: CmsFunction): FunctionDoc {
    const { id, ...rest } = fn;
    return { _id: id, ...rest };
}

function fromDoc(doc: FunctionDoc | null): CmsFunction | null {
    if (!doc) {
        return null;
    }
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && (error as { code?: number }).code === 11000;
}
