import { createOfficialRepositoryApplication } from "./application";
import { readOfficialRepositoryEnv } from "./env";
import { startOfficialRepositoryServer } from "./server";
import { seedOfficialRepository } from "./seed";
import { createRepositoryLogger } from "./logger";

const logger = createRepositoryLogger(process.env);
try {
    await startRepository();
} catch (error) {
    logger.fatal("repository.startup.failed", {}, error);
    throw error;
}

async function startRepository(): Promise<void> {
    const env = readOfficialRepositoryEnv(process.env);
    await seedOfficialRepository(env.root, env.seedRoot);
    const application = await createOfficialRepositoryApplication(env.root, env.token);
    const server = startOfficialRepositoryServer(application, env, logger);

    let stopping = false;
    async function shutdown(signal: string): Promise<void> {
        if (stopping) {
            return;
        }
        stopping = true;
        logger.info("repository.stopping", { signal });
        await server.stopGracefully(env.shutdownTimeoutMs);
    }
    const handleSignal = (signal: string): void => {
        void shutdown(signal).catch((error) => {
            logger.fatal("repository.shutdown.failed", {}, error);
            process.exitCode = 1;
        });
    };
    process.on("SIGINT", () => handleSignal("SIGINT"));
    process.on("SIGTERM", () => handleSignal("SIGTERM"));
}
