import { runCli } from "../../src/cli";

export async function prepareDevRepository(input: {
    workspace: string;
    integrations: string;
    data: string;
}): Promise<void> {
    await runCli(["release", "newsletter", "--root", input.integrations], {
        cwd: input.workspace,
        environment: { ULVIA_DATA_DIR: input.data },
        releaseVerifier: { verify: async () => undefined },
        log: () => undefined,
    });
}
