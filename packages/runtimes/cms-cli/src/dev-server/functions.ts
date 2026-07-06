import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    DuplicateFunctionError,
    type CmsFunction,
    type FunctionRepository,
} from "@bernouy/cms-functions";

const GENERATED_FUNCTIONS_DIR = ".p9r/generated/functions";

export class LocalFsFunctionRepository implements FunctionRepository {
    private readonly dir: string;

    constructor(siteDir: string) {
        this.dir = join(siteDir, GENERATED_FUNCTIONS_DIR);
    }

    async createFunction(fn: CmsFunction): Promise<CmsFunction> {
        if (await this.getFunction(fn.id)) throw new DuplicateFunctionError(fn.id);
        await this.writeFunction(fn);
        return structuredClone(fn);
    }

    async updateFunction(fn: CmsFunction): Promise<CmsFunction | null> {
        if (!(await this.getFunction(fn.id))) return null;
        await this.writeFunction(fn);
        return structuredClone(fn);
    }

    async deleteFunction(id: string): Promise<boolean> {
        if (!(await this.getFunction(id))) return false;
        await unlink(this.fileFor(id)).catch((error: { code?: string }) => {
            if (error.code !== "ENOENT") throw error;
        });
        return true;
    }

    async getFunction(id: string): Promise<CmsFunction | null> {
        const fn = await this.readFunctionFile(this.fileFor(id));
        return fn ? structuredClone(fn) : null;
    }

    async getAllFunctions(): Promise<CmsFunction[]> {
        if (!existsSync(this.dir)) return [];
        let entries: string[];
        try {
            entries = await readdir(this.dir);
        } catch {
            return [];
        }
        const functions: CmsFunction[] = [];
        for (const entry of entries.sort()) {
            if (!entry.endsWith(".json")) continue;
            const fn = await this.readFunctionFile(join(this.dir, entry));
            if (fn) functions.push(fn);
        }
        return functions.map(fn => structuredClone(fn));
    }

    private async writeFunction(fn: CmsFunction): Promise<void> {
        await mkdir(this.dir, { recursive: true });
        await writeFile(this.fileFor(fn.id), `${JSON.stringify(fn, null, 4)}\n`, "utf-8");
    }

    private async readFunctionFile(file: string): Promise<CmsFunction | null> {
        if (!existsSync(file)) return null;
        try {
            const parsed = JSON.parse(await readFile(file, "utf-8")) as unknown;
            return isFunction(parsed) ? parsed : null;
        } catch (error) {
            console.warn(`[integrations] skipped generated function ${file}: ${message(error)}`);
            return null;
        }
    }

    private fileFor(id: string): string {
        return join(this.dir, `${safeFileName(id)}.json`);
    }
}

function isFunction(value: unknown): value is CmsFunction {
    return !!value
        && typeof value === "object"
        && !Array.isArray(value)
        && typeof (value as { id?: unknown }).id === "string"
        && typeof (value as { method?: unknown }).method === "string"
        && Array.isArray((value as { steps?: unknown }).steps)
        && typeof (value as { return?: unknown }).return === "object"
        && (value as { return?: unknown }).return !== null;
}

function safeFileName(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
