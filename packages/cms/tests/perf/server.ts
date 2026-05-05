import { AuthRepositoryProvider, Be5_Authentication, Be5_Runner } from "@bernouy/socle";
import { MongoClient } from "mongodb";
import { resolve } from "node:path";
import { Cms } from "../../src/Cms";
import { DefaultCmsRepository } from "../../src/providers/mongo/Repository/DefaultCmsRepository";
import { DefaultMediaRepository } from "../../src/providers/mongo/Media/DefaultMediaRepository";
import { scanDevBlocs } from "../../src/cli/dev-server/scan";
import { buildAllDevBlocs } from "../../src/cli/dev-server/build";

export type PerfServer = {
    port: number;
    baseUrl: string;
    stop: () => Promise<void>;
};

export async function startPerfServer(opts: { port?: number; dbName?: string; mongoUri?: string } = {}): Promise<PerfServer> {
    const port = opts.port ?? 4999;
    const dbName = opts.dbName ?? "p9r_perf_test";
    const mongoUri = opts.mongoUri ?? "mongodb://localhost:27017";

    const mongoClient = await new MongoClient(mongoUri).connect();
    await mongoClient.db(dbName).dropDatabase();

    const runner = new Be5_Runner();
    const repository = new DefaultCmsRepository(mongoClient, dbName);
    const authRepository = new AuthRepositoryProvider(mongoClient, dbName);
    const mediaRepository = new DefaultMediaRepository("default", mongoClient, dbName, runner);

    const auth = new Be5_Authentication(authRepository, runner, {
        basePath: "/auth",
        defaultRedirection: "/cms/admin/pages",
        registerDisabled: false,
    });

    runner.group("/cms", (scoped) => {
        new Cms(scoped, repository, auth, mediaRepository, {});
    });

    // Build + register the perf-scenario blocs so the BlocLibrary has real
    // custom elements to insert. Skipped if the folder doesn't exist so the
    // server still works without them.
    await registerPerfBlocs(repository);

    runner.start(port);

    return {
        port,
        baseUrl: `http://localhost:${port}`,
        stop: async () => {
            await mongoClient.close(true);
            const stop = (runner as unknown as { stop?: () => void }).stop;
            if (typeof stop === "function") stop.call(runner);
        },
    };
}

async function registerPerfBlocs(repository: DefaultCmsRepository) {
    const dir = resolve(import.meta.dir, "components");
    const blocs = await scanDevBlocs(dir, { quiet: true });
    if (blocs.length === 0) return;
    const built = await buildAllDevBlocs(blocs);
    for (const b of built.values()) {
        await repository.createBloc({
            id: b.tag,
            name: b.label,
            group: b.group,
            description: b.description,
            viewJS: b.viewJS,
            editorJS: b.editorJS ?? "",
        });
    }
    console.log(`  → registered ${built.size} perf bloc(s): ${[...built.keys()].join(", ")}`);
}
