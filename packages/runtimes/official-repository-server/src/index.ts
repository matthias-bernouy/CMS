import { join } from "node:path";
import { TransformersEmbeddings } from "@bernouy/text-embeddings";
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
    const model = new TransformersEmbeddings({
        cacheDirectory: env.modelDirectory ?? join(env.root, ".search-models"),
        localFilesOnly: Boolean(env.modelDirectory),
        threads: 2,
    });
    let application: Awaited<ReturnType<typeof createOfficialRepositoryApplication>> | undefined;
    let server: ReturnType<typeof startOfficialRepositoryServer>;
    try {
        await seedOfficialRepository(env.root, env.seedRoot);
        application = await createOfficialRepositoryApplication(env.root, model);
        server = startOfficialRepositoryServer(application, env, logger);
        void application
            .prepareSearch()
            .catch((error) => logger.warn("repository.search.preparation.failed", {}, error));
    } catch (error) {
        try {
            await closeSearch();
        } finally {
            await ownership.release();
        }
        throw error;
    }

    async function closeSearch(): Promise<void> {
        try {
            await application?.close();
        } finally {
            await model.close();
        }
    }

    let stopping = false;
    void ownership.exited
        .then(async () => {
            if (!stopping) {
                stopping = true;
                logger.fatal("repository.ownership.lost", {});
                process.exitCode = 1;
                await server.stopGracefully(0);
                await closeSearch();
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
            try {
                await closeSearch();
            } finally {
                await ownership.release();
            }
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
