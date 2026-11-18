import { open } from "node:fs/promises";
import { createNodeLogger } from "@bernouy/logging/node";
import { MongoClient } from "mongodb";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { upgradeMongoContentReferences, recoverMongoContentReferenceFence } from "@bernouy/content/mongo/maintenance";
import { CollectionStore } from "@bernouy/repository/collections/installations";
import { MongoCollectionStorage } from "@bernouy/repository/collections/mongo";
import { withInstalledCollections } from "@bernouy/repository/collections/content";
import { contentMaintenanceOptions } from "./options";

async function readUri(path: string) {
    const file = await open(path, "r");
    try {
        if (!(await file.stat()).isFile()) {
            throw new Error("Mongo URI must come from a regular secret file");
        }
        const bytes = Buffer.alloc(4097);
        let bytesRead = 0;
        while (bytesRead < bytes.length) {
            const chunk = await file.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead);
            if (chunk.bytesRead === 0) {
                break;
            }
            bytesRead += chunk.bytesRead;
        }
        if (bytesRead > 4096) {
            throw new Error("Mongo URI secret file exceeds 4 KiB");
        }
        const uri = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, bytesRead)).trim();
        if (!/^mongodb(?:\+srv)?:\/\//.test(uri)) {
            throw new Error("The secret file must contain a Mongo connection URI");
        }
        return uri;
    } finally {
        await file.close();
    }
}

export async function runContentStorageMaintenance(args: readonly string[]) {
    const options = contentMaintenanceOptions(args);
    const client = new MongoClient(await readUri(options.uriFile), {
        appName: "ulvia-content-maintenance",
        monitorCommands: true,
        serverSelectionTimeoutMS: 5000,
    });
    try {
        await client.connect();
        const db = client.db(options.database);
        if (options.action === "status") {
            return {
                format: await db
                    .collection(options.prefix + "content_metadata")
                    .findOne({ _id: "bloc-references" } as never),
                upgrade: await db
                    .collection(options.prefix + "content_metadata")
                    .findOne({ _id: "bloc-references-upgrade" } as never),
                fence: await db
                    .collection(options.prefix + "site_bloc_publication_locks")
                    .findOne({ _id: "published-graph" } as never),
            };
        }
        const offline = { writersStopped: true as const, collectionPrefix: options.prefix };
        if (options.action === "upgrade-references") {
            return await upgradeMongoContentReferences(db, offline);
        }
        const collections = new CollectionStore(new MongoCollectionStorage(db));
        const projected = withInstalledCollections(
            new MongoContentRepository(db, { collectionPrefix: options.prefix }),
            collections,
            options.siteId!,
        );
        return await recoverMongoContentReferenceFence(db, {
            ...offline,
            expectedToken: options.expectedToken!,
            resolveExternalReference: async (tag) => !!(await projected.getBlocRecord(tag))?.artifact,
        });
    } finally {
        await client.close();
    }
}

if (import.meta.main) {
    const logger = createNodeLogger({
        service: "content-maintenance",
        level: "info",
        format: "json",
        includeErrorStack: false,
    });
    try {
        process.stdout.write(JSON.stringify(await runContentStorageMaintenance(Bun.argv.slice(2))) + "\n");
    } catch (error) {
        logger.error("content.maintenance.failed", {
            reason: error instanceof Error ? error.message : "Content maintenance failed",
        });
        process.exitCode = 1;
    }
}
