import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { repositoryApplication } from "../../../fixtures/repository/application";

export const documentationRepositoryEntrypoint = import.meta.path;

// Focused protocol peer; the full Repository CMS is exercised in repository/journey.test.ts.
if (import.meta.main) {
    const [root, rawPort] = process.argv.slice(2);
    if (!root || !rawPort) {
        throw new Error("Repository storage and port are required");
    }
    await mkdir(root, { recursive: true, mode: 0o700 });
    const app = repositoryApplication(root, "documentation-integration");
    const account = await app.account("documentation-publisher");
    await writeFile(join(root, "fixture-account.json"), JSON.stringify(account), { mode: 0o600, flag: "wx" });
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: Number(rawPort),
        fetch(request) {
            return new URL(request.url).pathname === "/readyz" ? new Response("ready") : app.handle(request);
        },
    });
    process.on("SIGTERM", () => {
        void app.close().finally(() => server.stop(true));
    });
}
