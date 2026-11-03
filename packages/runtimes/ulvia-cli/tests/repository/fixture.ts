import { repositoryApplication } from "../../../../../tests/fixtures/repository/application";
import { RepositoryNamespaceClient } from "@bernouy/cms-repository/repository/namespaces";
import { runCli } from "../../src/cli";

export function startTestRepository(root: string) {
    const application = repositoryApplication(root);
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: application.handle });
    const url = server.url.origin;
    const owner = application.account();
    const connection = async () => ({
        origin: url,
        repositoryId: application.repositoryId,
        resolveToken: async () => (await owner).token,
    });
    const claim = async (namespace = "ulvia.official") => {
        const client = new RepositoryNamespaceClient(url, { credential: await connection() });
        await client.claim(namespace);
        return client.ownedCredential(namespace);
    };
    return {
        url,
        claim,
        application,
        async stop() {
            server.stop(true);
            await application.close();
        },
        async connect(data: string) {
            const { token } = await owner;
            const options = {
                environment: { ULVIA_DATA_DIR: data, ULVIA_REPOSITORY_TOKEN: token },
                log: () => undefined,
            };
            await runCli(["repository", "login", url], options);
            await claim();
        },
    };
}
