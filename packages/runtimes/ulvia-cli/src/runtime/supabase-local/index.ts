import { BunLocalSupabaseDatabase, type LocalSupabaseDatabase } from "./database";
import { SupabaseCliFunctionsRuntime, type LocalSupabaseFunctionsRuntime } from "./functions-runtime";
import { handleLocalSupabaseManagementRequest } from "./management-handler";
import { LocalSupabaseProject } from "./project";

export type LocalSupabaseManagementServer = Readonly<{
    url: string;
    stop(): Promise<void>;
}>;

export type LocalSupabaseManagementHandler = Readonly<{
    fetch(request: Request): Promise<Response>;
    close(): Promise<void>;
}>;

export type LocalSupabaseManagementOptions = Readonly<{
    projectRoot: string;
    projectRef: string;
    accessToken: string;
    databaseUrl: string;
    port: number;
    database?: LocalSupabaseDatabase;
    functionsRuntime?: LocalSupabaseFunctionsRuntime;
}>;

export async function startLocalSupabaseManagementServer(
    options: LocalSupabaseManagementOptions,
): Promise<LocalSupabaseManagementServer> {
    const handler = await createLocalSupabaseManagementHandler(options);
    const server = Bun.serve({ hostname: "127.0.0.1", port: options.port, fetch: handler.fetch });
    return {
        url: `http://127.0.0.1:${server.port}`,
        stop: async () => {
            await server.stop(true);
            await handler.close();
        },
    };
}

export async function createLocalSupabaseManagementHandler(
    options: LocalSupabaseManagementOptions,
): Promise<LocalSupabaseManagementHandler> {
    const project = await LocalSupabaseProject.open(options.projectRoot);
    const database = options.database ?? new BunLocalSupabaseDatabase(options.databaseUrl);
    const functionsRuntime = options.functionsRuntime ?? new SupabaseCliFunctionsRuntime(options.projectRoot);
    const basePath = `/v1/projects/${options.projectRef}`;
    return {
        fetch: async (request) =>
            await handleLocalSupabaseManagementRequest(
                request,
                basePath,
                options.accessToken,
                project,
                database,
                functionsRuntime,
            ),
        close: async () => {
            try {
                await functionsRuntime.stop();
            } finally {
                await database.close();
            }
        },
    };
}
