import { resolve } from "node:path";
import { readClientConfig } from "../../runtime/repository/config";
import { createIdentity, selectIdentity, useIdentity } from "../../runtime/repository/identities";

const HELP = `Usage:
  ulvia identity create <name>
  ulvia identity import <name> --key-file <private-file>
  ulvia identity use <name>
  ulvia identity list
  ulvia identity public-key [name]

Identities are local Ed25519 keys shared across Repository connections.
Back up private keys securely. Lost keys cannot be recovered by an operator.`;

export async function identityCommand(
    args: readonly string[],
    directory: string,
    cwd: string,
    log: (message: string) => void,
): Promise<void> {
    const [action, name, ...rest] = args;
    if (!action || action === "help" || action === "--help") {
        log(HELP);
        return;
    }
    if (action === "list" && args.length === 1) {
        const config = await readClientConfig(directory);
        for (const [key, identity] of Object.entries(config.identities)) {
            log(`${key === config.activeIdentity ? "*" : " "} ${key} ${identity.publicKey}`);
        }
        return;
    }
    if (action === "public-key" && args.length <= 2) {
        log((await selectIdentity(directory, name)).publicKey);
        return;
    }
    if (!name) {
        throw new Error(HELP);
    }
    if (
        (action === "create" && !rest.length) ||
        (action === "import" && rest.length === 2 && rest[0] === "--key-file")
    ) {
        const identity = await createIdentity(
            directory,
            name,
            action === "import" ? resolve(cwd, rest[1]!) : undefined,
        );
        log(`Identity ${name} saved. Public key: ${identity.publicKey}`);
    } else if (action === "use" && !rest.length) {
        await useIdentity(directory, name);
        log(`Active identity: ${name}`);
    } else {
        throw new Error(HELP);
    }
}
