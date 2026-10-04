import { createOfficialRepositoryApplication } from "./application";
import { readOfficialRepositoryEnv } from "./env";
import { startOfficialRepositoryServer } from "./server";

const env = readOfficialRepositoryEnv(process.env);
const application = await createOfficialRepositoryApplication(env.root, env.token);
const server = startOfficialRepositoryServer(application, env);

let stopping = false;
async function shutdown(signal: string): Promise<void> {
    if (stopping) {
        return;
    }
    stopping = true;
    console.log(`\nStopping official repository (${signal})...`);
    await server.stopGracefully(env.shutdownTimeoutMs);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
