import { RepositoryNamespaceClient } from "@bernouy/cms-repository/repository/namespaces";
import { clientConfigDirectory } from "../../runtime/repository/config";
import { savedRepositoryCredential } from "../../runtime/repository/connection";

const HELP = `Usage:
  ulvia namespace list [--repository <url>]
  ulvia namespace <claim | status> <namespace> [--repository <url>]
  ulvia namespace transfer <namespace> --account <target-account-id> [--repository <url>]
  ulvia namespace suspend <namespace> --yes [--repository <url>]

Mutations use the account authenticated by repository login.
Suspension reserves the namespace and prevents publication.
Credentials are never forwarded to an override with a different origin.`;

export async function namespaceCommand(
    args: readonly string[],
    environment: Record<string, string | undefined>,
    log: (message: string) => void,
): Promise<void> {
    const [action] = args;
    if (!action || action === "--help" || action === "help") {
        log(HELP);
        return;
    }
    const list = action === "list";
    const namespace = list ? undefined : args[1];
    if (!["list", "claim", "status", "transfer", "suspend"].includes(action) || (!list && !namespace)) {
        throw new Error(HELP);
    }
    const rest = args.slice(list ? 1 : 2);
    const yes = action === "suspend" && rest.filter((value) => value === "--yes").length === 1;
    const values = namespaceOptions(
        yes ? rest.filter((value) => value !== "--yes") : rest,
        action === "transfer" ? ["--repository", "--account"] : ["--repository"],
    );
    const url = values.get("--repository") ?? environment.ULVIA_REPOSITORY_URL;
    if (!url || (action === "suspend" && !yes) || (action === "transfer" && !values.has("--account"))) {
        throw new Error(HELP);
    }
    if (action === "status") {
        log(JSON.stringify(await new RepositoryNamespaceClient(url).get(namespace!)));
        return;
    }
    const credential = await savedRepositoryCredential(clientConfigDirectory(environment), url);
    const client = new RepositoryNamespaceClient(url, { credential });
    if (list) {
        log(JSON.stringify(await client.list()));
    } else if (action === "claim") {
        log(JSON.stringify(await client.claim(namespace!)));
    } else {
        const current = (await client.list()).find((entry) => entry.namespace === namespace);
        if (!current) {
            throw new Error("This account does not own the Repository namespace");
        }
        log(
            JSON.stringify(
                action === "transfer"
                    ? await client.transfer(namespace!, current.revision, values.get("--account")!)
                    : await client.suspend(namespace!, current.revision),
            ),
        );
    }
}

function namespaceOptions(args: readonly string[], allowed: readonly string[]): Map<string, string> {
    const values = new Map<string, string>();
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index]!;
        const value = args[index + 1];
        if (!allowed.includes(key) || values.has(key) || !value || value.startsWith("--")) {
            throw new Error(`Invalid namespace option: ${key}`);
        }
        values.set(key, value);
    }
    return values;
}
