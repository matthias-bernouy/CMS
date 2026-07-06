import type { CmsFunction } from "./FunctionDefinition";

export interface FunctionRepository {
    createFunction(fn: CmsFunction): Promise<CmsFunction>;
    updateFunction(fn: CmsFunction): Promise<CmsFunction | null>;
    deleteFunction(id: string): Promise<boolean>;
    getFunction(id: string): Promise<CmsFunction | null>;
    getAllFunctions(): Promise<CmsFunction[]>;
}
