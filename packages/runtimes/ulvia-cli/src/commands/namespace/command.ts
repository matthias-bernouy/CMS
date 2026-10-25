import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
    RepositoryNamespaceClient,
    type RepositoryOwnerCredential,
} from "@bernouy/cms-repository/repository/namespaces";
import { readNamespacePrivateKey } from "./credentials";

const HELP = `Usage:
  ulvia namespace keygen --key-file <new-private-file>
  ulvia namespace <claim | status | rotate | revoke> <namespace> --repository <url> [--replacement-key-file <file>] [--yes]

Mutations read the current private key from ULVIA_REPOSITORY_PRIVATE_KEY_FILE.
Rotation requires a separately generated replacement key. After rotation, select
the replacement file for subsequent writes. Revoke requires --yes and is permanent.`;

export async function namespaceCommand(
    args: readonly string[],
    environment: Record<string, string | undefined>,
    cwd: string,
    log: (message: string) => void,
): Promise<void> {
    const [action, namespace, ...rest] = args;
    if (!action || action === "--help" || action === "help") {
        log(HELP);
        return;
    }
    if (action === "keygen") {
        if (namespace !== "--key-file" || rest.length !== 1) {
            throw new Error(HELP);
        }
        const pair = generateKeyPairSync("ed25519");
        const path = resolve(cwd, rest[0]!);
        await writeFile(path, pair.privateKey.export({ type: "pkcs8", format: "pem" }), { flag: "wx", mode: 0o600 });
        log(`Namespace key created: ${path}`);
        log(`Public key: ${pair.publicKey.export({ type: "spki", format: "der" }).toString("base64url")}`);
        return;
    }
    if (!namespace || !["claim", "status", "rotate", "revoke"].includes(action)) {
        throw new Error(HELP);
    }
    const values = new Map<string, string>();
    for (let index = 0; index < rest.length; index++) {
        const key = rest[index]!;
        if (values.has(key) || !["--repository", "--replacement-key-file", "--yes"].includes(key)) {
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
        (values.has("--replacement-key-file") && action !== "rotate")
    ) {
        throw new Error(HELP);
    }
    const client = new RepositoryNamespaceClient(url);
    const state = await client.get(namespace);
    if (action === "status") {
        log(JSON.stringify(state));
        return;
    }
    const path = environment.ULVIA_REPOSITORY_PRIVATE_KEY_FILE;
    if (!path) {
        throw new Error("ULVIA_REPOSITORY_PRIVATE_KEY_FILE is required");
    }
    const credential: RepositoryOwnerCredential = {
        namespace,
        repositoryId: await client.identity(),
        revision: action === "claim" ? 0 : (state?.revision ?? 0),
        resolvePrivateKey: () => readNamespacePrivateKey(resolve(cwd, path)),
    };
    if (action === "claim") {
        await client.claim(credential, publicKey(await credential.resolvePrivateKey()));
    } else if (action === "rotate") {
        const replacement = values.get("--replacement-key-file");
        if (!replacement) {
            throw new Error(HELP);
        }
        const key = await readNamespacePrivateKey(resolve(cwd, replacement));
        await client.rotate(credential, { publicKey: publicKey(key), resolvePrivateKey: async () => key });
    } else {
        await client.revoke(credential);
    }
    log(`Namespace ${namespace}: ${action} completed.`);
}

function publicKey(privateKey: string): string {
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== "ed25519") {
        throw new Error("Namespace private key must use Ed25519");
    }
    return createPublicKey(key).export({ type: "spki", format: "der" }).toString("base64url");
}
