import { MongoClient } from "mongodb";
import { ValidatingContentRepository } from "@bernouy/content";
import { MongoContentRepository } from "@bernouy/content/mongo";

const [url, operation, identity] = Bun.argv.slice(2);
if (!identity || !url || !url.startsWith("mongodb://127.0.0.1:") || !["delete", "insert"].includes(operation ?? "")) {
    throw new Error("An isolated loopback Mongo and an explicit lifecycle operation are required");
}
const client = new MongoClient(url, { appName: "content-lifecycle-worker", monitorCommands: true });
let reported = false;
client.on("commandSucceeded", (event) => {
    if (
        !reported &&
        event.commandName === "find" &&
        event.reply.cursor?.firstBatch?.some(
            (row: { phase?: string }) => row.phase === "leased" || row.phase === "committing",
        )
    ) {
        reported = true;
        console.log("waiting");
    }
});
try {
    await client.connect();
    const repository = new ValidatingContentRepository(new MongoContentRepository(client.db()));
    try {
        if (operation === "delete") {
            await repository.deleteSiteBloc("site-target", 1, identity);
        } else {
            await repository.insertPage("/consumer", "Consumer", '<div cms-bloc="site-target"></div>');
        }
        console.log(JSON.stringify({ ok: true }));
    } catch (error) {
        console.log(JSON.stringify({ ok: false, name: error instanceof Error ? error.name : "unknown" }));
    }
} finally {
    await client.close();
}
