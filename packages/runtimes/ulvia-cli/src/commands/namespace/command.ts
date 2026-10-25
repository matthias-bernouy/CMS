import {
    RepositoryNamespaceClient,
    type RepositoryOwnerCredential,
} from "@bernouy/cms-repository/repository/namespaces";
import { readNamespacePrivateKey } from "../../runtime/repository/keys";

import { clientConfigDirectory } from "../../runtime/repository/config";
import { assertSavedRepository } from "../../runtime/repository/connection";
import { namespacePublicKey as publicKey, selectIdentity } from "../../runtime/repository/identities";

const HELP = `Usage:
  ulvia namespace <claim | status | rotate | revoke> <namespace> [--repository <url>] [--identity <name>] [--replacement-identity <name>] [--yes]

Mutations use saved local identities; --identity selects a claim owner.
Rotation requires --replacement-identity <name>.
The active Repository comes from repository login; --repository overrides it.
Revoke requires --yes and is permanent. There is no operator key recovery.`;

export async function namespaceCommand(
    args: readonly string[],
    environment: Record<string, string | undefined>,
    log: (message: string) => void,
): Promise<void> {
    const [action, namespace, ...rest] = args;
    if (!action || action === "--help" || action === "help") {
        log(HELP);
        return;
    }
    if (!namespace || !["claim", "status", "rotate", "revoke"].includes(action)) {
        throw new Error(HELP);
    }
    const values = new Map<string, string>();
    for (let index = 0; index < rest.length; index++) {
        const key = rest[index]!;
        if (values.has(key) || !["--repository", "--replacement-identity", "--identity", "--yes"].includes(key)) {
            throw new Error(HELP);
        }
        const value = key === "--yes" ? "true" : rest[++index];
        if (!value || value.startsWith("--")) {
            throw new Error(HELP);
        }
        values.set(key, value);
    }
    const url = values.get("--repository") ?? environment.ULVIA_REPOSITORY_URL;
    if (
        !url ||
        (action === "revoke" && !values.has("--yes")) ||
        (values.has("--yes") && action !== "revoke") ||
        (values.has("--replacement-identity") && action !== "rotate")
    ) {
        throw new Error(HELP);
    }
    const client = new RepositoryNamespaceClient(url);
    const repositoryId = await client.identity();
    const directory = clientConfigDirectory(environment);
    await assertSavedRepository(directory, url, repositoryId);
    const state = await client.get(namespace);
    if (action === "status") {
        log(JSON.stringify(state));
        return;
    }
    const { keyFile } = await selectIdentity(
        directory,
        values.get("--identity"),
        action === "claim" ? undefined : state?.publicKey,
    );
    const credential: RepositoryOwnerCredential = {
        namespace,
        repositoryId,
        revision: action === "claim" ? 0 : (state?.revision ?? 0),
        resolvePrivateKey: () => readNamespacePrivateKey(keyFile),
    };
    if (action === "claim") {
        await client.claim(credential, publicKey(await credential.resolvePrivateKey()));
    } else if (action === "rotate") {
        const name = values.get("--replacement-identity");
        if (!name) {
            throw new Error(HELP);
        }
        const replacement = await selectIdentity(directory, name);
        const key = await readNamespacePrivateKey(replacement.keyFile);
        await client.rotate(credential, { publicKey: publicKey(key), resolvePrivateKey: async () => key });
    } else {
        await client.revoke(credential);
    }
    log(`Namespace ${namespace}: ${action} completed.`);
}
