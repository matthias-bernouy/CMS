import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { readLocalFunctionBundle, type LocalFunctionMetadata } from "./function-bundle";

type FunctionReceipt = Readonly<{ slug: string; status: "ACTIVE"; ezbr_sha256: string }>;
type FunctionState = Readonly<{ receipt: FunctionReceipt; metadata: LocalFunctionMetadata }>;
type ProjectState = {
    schema: "ulvia.local-supabase-management.v1";
    dataApiSchemas: string[];
    secrets: Record<string, string>;
    functions: Record<string, FunctionState>;
};

const START_MARKER = "# Ulvia local Function configuration (managed)";
const END_MARKER = "# End Ulvia local Function configuration";

export class LocalSupabaseProject {
    private constructor(
        private readonly supabaseRoot: string,
        private readonly statePath: string,
        private readonly state: ProjectState,
    ) {}

    static async open(projectRoot: string): Promise<LocalSupabaseProject> {
        const supabaseRoot = join(projectRoot, "supabase");
        const statePath = join(supabaseRoot, ".ulvia", "management.json");
        await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
        const state = await readState(statePath);
        return new LocalSupabaseProject(supabaseRoot, statePath, state);
    }

    dataApiSchemas(): string[] {
        return [...this.state.dataApiSchemas];
    }

    async setDataApiSchemas(schemas: string[]): Promise<void> {
        this.state.dataApiSchemas = [...schemas];
        await this.persist();
    }

    async setSecrets(entries: Array<{ name: string; value: string }>): Promise<void> {
        for (const { name, value } of entries) {
            this.state.secrets[name] = value;
        }
        await this.persist();
        const source = Object.entries(this.state.secrets)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
            .join("\n");
        await privateWrite(join(this.supabaseRoot, "functions", ".env"), `${source}\n`);
    }

    async deployFunction(slug: string, form: FormData): Promise<FunctionReceipt> {
        const bundle = await readLocalFunctionBundle(form);
        await replaceFunctionDirectory(join(this.supabaseRoot, "functions"), slug, bundle.files);
        const receipt: FunctionReceipt = { slug, status: "ACTIVE", ezbr_sha256: bundle.digest };
        this.state.functions[slug] = { receipt, metadata: bundle.metadata };
        await this.persist();
        await this.writeFunctionConfig();
        return receipt;
    }

    functionReceipt(slug: string): FunctionReceipt | null {
        return this.state.functions[slug]?.receipt ?? null;
    }

    hasFunctions(): boolean {
        return Object.keys(this.state.functions).length > 0;
    }

    private async persist(): Promise<void> {
        await privateWrite(this.statePath, `${JSON.stringify(this.state, null, 2)}\n`);
    }

    private async writeFunctionConfig(): Promise<void> {
        const configPath = join(this.supabaseRoot, "config.toml");
        const current = await readFile(configPath, "utf8");
        const start = current.indexOf(START_MARKER);
        const end = current.indexOf(END_MARKER);
        const unmanaged =
            start >= 0 && end >= start
                ? `${current.slice(0, start)}${current.slice(end + END_MARKER.length)}`
                : current;
        const sections = Object.entries(this.state.functions)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([slug, value]) => functionSection(slug, value.metadata))
            .join("\n\n");
        await privateWrite(configPath, `${unmanaged.trimEnd()}\n\n${START_MARKER}\n${sections}\n${END_MARKER}\n`);
    }
}

function functionSection(slug: string, metadata: LocalFunctionMetadata): string {
    const root = `./functions/${slug}/`;
    const lines = [`[functions.${slug}]`, `entrypoint = ${JSON.stringify(root + metadata.entrypoint_path)}`];
    if (metadata.import_map_path) {
        lines.push(`import_map = ${JSON.stringify(root + metadata.import_map_path)}`);
    }
    if (metadata.static_patterns) {
        lines.push(`static_files = ${JSON.stringify(metadata.static_patterns.map((pattern) => root + pattern))}`);
    }
    if (metadata.verify_jwt !== undefined) {
        lines.push(`verify_jwt = ${metadata.verify_jwt}`);
    }
    return lines.join("\n");
}

async function replaceFunctionDirectory(
    functionsRoot: string,
    slug: string,
    files: ReadonlyArray<Readonly<{ path: string; bytes: Uint8Array }>>,
): Promise<void> {
    await mkdir(functionsRoot, { recursive: true, mode: 0o700 });
    const staging = join(functionsRoot, `.ulvia-staging-${slug}-${randomUUID()}`);
    const target = join(functionsRoot, slug);
    const backup = join(functionsRoot, `.ulvia-backup-${slug}-${randomUUID()}`);
    await mkdir(staging, { recursive: true, mode: 0o700 });
    try {
        for (const file of files) {
            const path = join(staging, ...file.path.split("/"));
            await mkdir(dirname(path), { recursive: true, mode: 0o700 });
            await writeFile(path, file.bytes, { mode: 0o600 });
        }
        const replaced = await rename(target, backup).then(
            () => true,
            (error: NodeJS.ErrnoException) => (error.code === "ENOENT" ? false : Promise.reject(error)),
        );
        try {
            await rename(staging, target);
        } catch (error) {
            if (replaced) {
                await rename(backup, target).catch(() => undefined);
            }
            throw error;
        }
        if (replaced) {
            await rm(backup, { recursive: true, force: true });
        }
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
}

async function readState(path: string): Promise<ProjectState> {
    const source = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (source === null) {
        return {
            schema: "ulvia.local-supabase-management.v1",
            dataApiSchemas: ["public", "graphql_public"],
            secrets: {},
            functions: {},
        };
    }
    await chmod(path, 0o600);
    const state = JSON.parse(source) as ProjectState;
    if (state.schema !== "ulvia.local-supabase-management.v1") {
        throw new Error("Ulvia local Supabase management state is invalid");
    }
    return state;
}

async function privateWrite(path: string, source: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const staging = `${path}.${randomUUID()}.tmp`;
    await writeFile(staging, source, { mode: 0o600 });
    await rename(staging, path);
    await chmod(path, 0o600);
}
