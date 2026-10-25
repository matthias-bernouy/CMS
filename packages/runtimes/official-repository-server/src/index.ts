import { createOfficialRepositoryApplication } from "./application";
import { readOfficialRepositoryEnv } from "./env";
import { startOfficialRepositoryServer } from "./server";
import { seedOfficialRepository } from "./seed";
import { createRepositoryLogger } from "./logger";
import { acquireRepositoryOwnership } from "./community/ownership";

const logger = createRepositoryLogger(process.env);
try {
    await startRepository();
} catch (error) {
    logger.fatal("repository.startup.failed", {}, error);
    throw error;
}

async function startRepository(): Promise<void> {
    const env = readOfficialRepositoryEnv(process.env);
    const ownership = await acquireRepositoryOwnership(env.root);
    let server: ReturnType<typeof startOfficialRepositoryServer>;
    try {
        await seedOfficialRepository(env.root, env.seedRoot);
        const application = await createOfficialRepositoryApplication(env.root);
        server = startOfficialRepositoryServer(application, env, logger);
    } catch (error) {
        await ownership.release();
        throw error;
    }

    let stopping = false;
    void ownership.exited
        .then(async () => {
            if (!stopping) {
                stopping = true;
                logger.fatal("repository.ownership.lost", {});
                process.exitCode = 1;
                await server.stopGracefully(0);
            }
        })
        .catch((error) => {
            logger.fatal("repository.shutdown.failed", {}, error);
            process.exitCode = 1;
        });
    async function shutdown(signal: string): Promise<void> {
        if (stopping) {
            return;
        }
        stopping = true;
        logger.info("repository.stopping", { signal });
        try {
            await server.stopGracefully(env.shutdownTimeoutMs);
        } finally {
            await ownership.release();
        }
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
