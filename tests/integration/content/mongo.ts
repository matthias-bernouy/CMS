import { MongoClient } from "mongodb";
import { docker } from "../instance/docker";

export async function contentMongo() {
    const name = `ulvia-content-lifecycle-${crypto.randomUUID().slice(0, 8)}`;
    await docker([
        "run",
        "--detach",
        "--name",
        name,
        "--publish",
        "127.0.0.1::27017",
        "mongo:7.0.37@sha256:d5b3ca8c3f3cdce78d44870dc0871b76d5235e9b2ad4ea6bea5d1fbff8027703",
        "mongod",
        "--bind_ip_all",
        "--setParameter",
        "enableTestCommands=1",
    ]);
    let client: MongoClient | undefined;
    const close = async () => {
        try {
            await client?.close();
        } finally {
            await docker(["rm", "--force", "--volumes", name], true);
        }
    };
    try {
        const port = (await docker(["port", name, "27017/tcp"])).stdout.trim().split(":").at(-1);
        const url = `mongodb://127.0.0.1:${port}/content_lifecycle?retryWrites=false`;
        for (let attempt = 0; attempt < 50; attempt++) {
            const candidate = new MongoClient(url, {
                appName: "content-lifecycle-parent",
                monitorCommands: true,
                serverSelectionTimeoutMS: 500,
            });
            try {
                await candidate.connect();
                client = candidate;
                return { client, url, close };
            } catch {
                await candidate.close();
                await Bun.sleep(100);
            }
        }
        throw new Error("Isolated Mongo did not become ready");
    } catch (error) {
        await close();
        throw error;
    }
}
