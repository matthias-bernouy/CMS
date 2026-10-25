import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readNamespacePrivateKey } from "./keys";
import {
    assertIdentityName,
    privateDirectory,
    readClientConfig,
    updateClientConfig,
    type ClientConfig,
    type ClientIdentity,
} from "./config";

export function namespacePublicKey(privateKey: string): string {
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== "ed25519") {
        throw new Error("Namespace private key must use Ed25519");
    }
    return createPublicKey(key).export({ type: "spki", format: "der" }).toString("base64url");
}

export async function createIdentity(directory: string, name: string, importedPath?: string): Promise<ClientIdentity> {
    assertIdentityName(name);
    return updateClientConfig(directory, async (config) => {
        if (Object.hasOwn(config.identities, name)) {
            throw new Error(`Identity already exists: ${name}`);
        }
        const privateKey = importedPath
            ? await readNamespacePrivateKey(importedPath)
            : generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
        const publicKey = namespacePublicKey(privateKey);
        const keys = join(directory, "keys");
        await privateDirectory(keys);
        const keyFile = join(keys, `${name}.pem`);
        await writeFile(keyFile, privateKey, { flag: "wx", mode: 0o600 });
        const identity = { keyFile, publicKey };
        config.identities[name] = identity;
        config.activeIdentity ??= name;
        return identity;
    });
}

export async function selectIdentity(directory: string, name?: string, owner?: string): Promise<ClientIdentity> {
    const config = await readClientConfig(directory);
    const candidates = name
        ? [name]
        : owner
          ? Object.keys(config.identities).filter((key) => config.identities[key]?.publicKey === owner)
          : config.activeIdentity
            ? [config.activeIdentity]
            : [];
    let failure: unknown = new Error(
        "No matching local identity; use ulvia identity create/import or repository login",
    );
    for (const selected of candidates) {
        const identity = Object.hasOwn(config.identities, selected) ? config.identities[selected] : undefined;
        if (!identity) {
            continue;
        }
        try {
            if (
                namespacePublicKey(await readNamespacePrivateKey(identity.keyFile)) !== identity.publicKey ||
                (owner && owner !== identity.publicKey)
            ) {
                throw new Error("Local identity does not match the namespace owner");
            }
            return identity;
        } catch (error) {
            failure = error;
        }
    }
    throw failure;
}

export async function ensureDefaultIdentity(directory: string): Promise<void> {
    const config = await readClientConfig(directory);
    if (!config.activeIdentity) {
        await createIdentity(directory, "default");
    }
}

export async function useIdentity(directory: string, name: string): Promise<void> {
    await selectIdentity(directory, name);
    await updateClientConfig(directory, async (config: ClientConfig) => {
        config.activeIdentity = name;
    });
}
