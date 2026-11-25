import { isAbsolute } from "node:path";
import { MongoClient } from "mongodb";
import { readProviderRuntimeEnv } from "../../runtimeEnv";
import { exportMaintenancePages } from "./export";

const directory = process.argv[2];
if (!directory || !isAbsolute(directory)) {
    throw new Error("Maintenance presentation requires an absolute output directory");
}
const env = readProviderRuntimeEnv(process.env);
const mongo = new MongoClient(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
try {
    await mongo.connect();
    const proxy = process.env.ULVIA_HOSTING_PROXY_URL;
    if (!proxy) {
        throw new Error("Maintenance presentation requires the private hosting proxy");
    }
    await exportMaintenancePages(mongo, directory, proxy);
} catch {
    await Bun.write(Bun.stderr, "Maintenance Page capture failed; installation services have not been stopped\n");
    process.exitCode = 1;
} finally {
    await mongo.close();
}
