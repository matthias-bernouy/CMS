import { BunLocalSupabaseDatabase, type LocalSupabaseDatabase } from "./database";
import { SupabaseCliFunctionsRuntime, type LocalSupabaseFunctionsRuntime } from "./functions-runtime";
import { handleLocalSupabaseManagementRequest } from "./management-handler";
import { LocalSupabaseProject } from "./project";
import { LocalStripeApi } from "./stripe-api";

export type LocalSupabaseManagementServer = Readonly<{
    url: string;
    stripeApiUrl: string;
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
        stripeApiUrl: `http://127.0.0.1:${server.port}/_stripe`,
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
    const stripe = new LocalStripeApi();
    const basePath = `/v1/projects/${options.projectRef}`;
    if (project.hasFunctions()) {
        try {
            await functionsRuntime.reload();
        } catch (error) {
            await functionsRuntime.stop().catch(() => undefined);
            await database.close().catch(() => undefined);
            throw error;
        }
    }
    return {
        fetch: async (request) => {
            const pathname = new URL(request.url).pathname;
            if (pathname.startsWith("/_stripe/")) {
                return await stripe.handle(request, "/_stripe");
            }
            return await handleLocalSupabaseManagementRequest(
                request,
                basePath,
                options.accessToken,
                project,
                database,
                functionsRuntime,
            );
        },
        close: async () => {
            try {
                await functionsRuntime.stop();
            } finally {
                await database.close();
            }
        },
    };
}
