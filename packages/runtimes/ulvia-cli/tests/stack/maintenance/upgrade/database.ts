import { MongoClient } from "mongodb";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readDeploymentState } from "../../../../src/runtime/stack/orchestration/state";
import type { UpgradeFixture } from "./fixture";
export async function database(f: UpgradeFixture) {
    const state = (await readDeploymentState(f.paths))!.applied!;
    const env = JSON.parse(await readFile(join(f.paths.services, "deployments", state.id, "environment.json"), "utf8"));
    const container = (await f.containers()).find(
        (row: any) => row.Config.Labels["com.docker.compose.service"] === "mongo",
    );
    const network = Object.values(container.NetworkSettings.Networks).find((row: any) => row.IPAddress) as {
        IPAddress: string;
    };
    const client = new MongoClient(
        `mongodb://${network.IPAddress}:27017/ulvia_provider_control?authSource=admin&retryWrites=false`,
        {
            auth: { username: env.ULVIA_MONGO_USERNAME, password: env.ULVIA_MONGO_PASSWORD },
            serverSelectionTimeoutMS: 1000,
            appName: "upgrade-crash-observer",
        },
    );
    await client.connect();
    const control = await client.db().collection("ulvia_provider_instances").findOne({ cmsUrl: f.origin });
    if (!control) {
        await client.close();
        throw new Error("Historical Control metadata is missing");
    }
    const db = client.db(`ulvia_${control.storageKey.replaceAll("-", "_")}`);
    return { client, db };
}
export async function until<T>(read: () => Promise<T | undefined | false | null>, timeout = 120000): Promise<T> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const value = await read();
        if (value) {
            return value;
        }
        await Bun.sleep(10);
    }
    throw new Error("Upgrade crash checkpoint timed out");
}
export async function journal(f: UpgradeFixture) {
    const file = Bun.file(join(f.paths.data, ".maintenance.json"));
    return (await file.exists()) ? file.json() : null;
}
