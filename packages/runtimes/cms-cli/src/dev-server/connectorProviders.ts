import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
    IntegrationConnectorProvider,
    IntegrationConnectorProviderRepository,
} from "@bernouy/cms-integrations";

const CONNECTOR_PROVIDERS_FILE = ".p9r/connector-providers.json";

/** Persistent, non-secret connector provider settings for the local runtime. */
export class LocalFsIntegrationConnectorProviderRepository implements IntegrationConnectorProviderRepository {
    private readonly file: string;

    constructor(siteDir: string) {
        this.file = join(siteDir, CONNECTOR_PROVIDERS_FILE);
    }

    async get(provider: "supabase"): Promise<IntegrationConnectorProvider | null> {
        const found = (await this.readAll()).find(candidate => candidate.provider === provider);
        return found ? copyProvider(found) : null;
    }

    async upsert(provider: IntegrationConnectorProvider): Promise<IntegrationConnectorProvider> {
        const providers = await this.readAll();
        const next = copyProvider(provider);
        const index = providers.findIndex(candidate => candidate.provider === provider.provider);
        if (index >= 0) providers[index] = next;
        else providers.push(next);
        await this.writeAll(providers);
        return copyProvider(next);
    }

    private async readAll(): Promise<IntegrationConnectorProvider[]> {
        let source: string;
        try {
            source = await readFile(this.file, "utf-8");
        } catch (error) {
            if (isNotFoundError(error)) return [];
            throw error;
        }

        const parsed = JSON.parse(source) as unknown;
        if (!Array.isArray(parsed)) {
            throw new Error(`Invalid connector provider settings in ${this.file}: expected an array`);
        }
        return parsed.map((value, index) => parseProvider(value, this.file, index));
    }

    private async writeAll(providers: IntegrationConnectorProvider[]): Promise<void> {
        await mkdir(dirname(this.file), { recursive: true });
        const temporaryFile = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
        try {
            await writeFile(temporaryFile, `${JSON.stringify(providers, null, 4)}\n`, "utf-8");
            await rename(temporaryFile, this.file);
        } catch (error) {
            await rm(temporaryFile, { force: true });
            throw error;
        }
    }
}

function parseProvider(value: unknown, file: string, index: number): IntegrationConnectorProvider {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Invalid connector provider settings in ${file}: entry ${index} must be an object`);
    }
    const provider = value as Record<string, unknown>;
    if (
        provider.provider !== "supabase"
        || typeof provider.enabled !== "boolean"
        || typeof provider.projectRef !== "string"
    ) {
        throw new Error(`Invalid connector provider settings in ${file}: entry ${index} is not a Supabase provider`);
    }
    return {
        provider: "supabase",
        enabled: provider.enabled,
        projectRef: provider.projectRef,
    };
}

function copyProvider(provider: IntegrationConnectorProvider): IntegrationConnectorProvider {
    return { ...provider };
}

function isNotFoundError(error: unknown): boolean {
    return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}
