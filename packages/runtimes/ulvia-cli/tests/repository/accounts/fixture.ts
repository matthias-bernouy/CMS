import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../src/cli";
import { startTestRepository } from "../fixture";

export async function accountFixture() {
    const root = await mkdtemp(join(tmpdir(), "ulvia-account-client-"));
    const remote = join(root, "remote");
    const server = startTestRepository(remote);
    const owner = await server.application.account("client-owner");
    const data = join(root, "data");
    const output: string[] = [];
    const options = {
        cwd: root,
        home: root,
        environment: { ULVIA_DATA_DIR: data, ULVIA_REPOSITORY_TOKEN: owner.token },
        log: (message: string) => output.push(message),
    };
    return {
        root,
        remote,
        server: { ...server, url: new URL(server.url) },
        data,
        output,
        options,
        application: server.application,
        owner,
        config: join(data, "config"),
        run: (args: string[]) => runCli(args, options),
        async close() {
            await server.stop();
            await rm(root, { recursive: true, force: true });
        },
    };
}
