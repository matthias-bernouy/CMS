import { clientConfigDirectory, readClientConfig, updateClientConfig } from "../../runtime/repository/config";
import { readRepositoryToken } from "../../runtime/repository/token";
import { loginRepository } from "../../runtime/repository/connection";

const HELP = `Usage:
  ulvia repository login <url> [--token-stdin]
  ulvia repository logout

Login verifies and saves a PAT pinned to the Repository origin and identity.
Provide it through ULVIA_REPOSITORY_TOKEN or bounded stdin; never as an argument.
Deploy a Repository with: ulvia instance create registry --profile ulvia/repository@1.0.0.
It uses the normal Edge, Provider and Mongo deployment.`;

export async function repositoryConnectionCommand(
    args: readonly string[],
    log: (message: string) => void,
    environment: Record<string, string | undefined>,
    stdin?: ReadableStream<Uint8Array>,
): Promise<void> {
    if (!args.length || args.includes("--help") || args[0] === "help") {
        log(HELP);
        return;
    }
    const [action, ...rest] = args;
    const directory = clientConfigDirectory(environment);
    if (action === "login") {
        if (!rest[0] || rest.length > 2 || (rest.length === 2 && rest[1] !== "--token-stdin")) {
            throw new Error(HELP);
        }
        const token =
            rest[1] === "--token-stdin"
                ? await readRepositoryToken(stdin ?? Bun.stdin.stream())
                : environment.ULVIA_REPOSITORY_TOKEN?.trim();
        if (!token) {
            throw new Error("Provide a Repository PAT through ULVIA_REPOSITORY_TOKEN or --token-stdin");
        }
        const id = await loginRepository(directory, rest[0], token);
        log(
            `Repository connection saved: ${(await readClientConfig(directory)).repository!.url} (${id}). Writes use the authenticated Repository account.`,
        );
        return;
    }
    if (action === "logout" && !rest.length) {
        await updateClientConfig(directory, async (config) => {
            delete config.repository;
        });
        log("Repository connection and stored PAT removed. The remote PAT is not revoked.");
        return;
    }
    throw new Error(HELP);
}
