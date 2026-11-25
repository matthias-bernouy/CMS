import { fileHash } from "../files";
import { command } from "../../process";
import { CLI_PACKAGE, NPM_REGISTRY, verifyNpmVersion } from "./registry";
import type { NpmTransport } from "./registry";
import { confirmNpm } from "./confirmation";
import { promoteNpm } from "./tags";
export type { NpmTransport } from "./registry";

export async function prepareNpmPublication(
    archive: string,
    version: string,
    transport: NpmTransport = { fetch, run: command },
) {
    const integrity = `sha512-${await fileHash(archive, "sha512", "base64")}`;
    await verifyNpmVersion(version, integrity, transport);
    const versionAvailable = (signal: AbortSignal) => verifyNpmVersion(version, integrity, transport, signal);
    async function verify(): Promise<void> {
        await confirmNpm(versionAvailable, `npm publication of ${CLI_PACKAGE}@${version}`, transport.confirmation);
    }
    return {
        verify,
        publish: async () => {
            if (await verifyNpmVersion(version, integrity, transport)) {
                return;
            }
            if (`sha512-${await fileHash(archive, "sha512", "base64")}` !== integrity) {
                throw new Error("CLI archive changed during publication");
            }
            let uncertain: unknown;
            try {
                await transport.run([
                    "bun",
                    "publish",
                    archive,
                    "--registry",
                    NPM_REGISTRY,
                    "--access",
                    "public",
                    "--tag",
                    `runtime-${version}`,
                    "--ignore-scripts",
                ]);
            } catch (error) {
                uncertain = error;
            }
            await confirmNpm(
                versionAvailable,
                `npm publication of ${CLI_PACKAGE}@${version}`,
                transport.confirmation,
                uncertain,
            );
        },
        promote: async () => {
            await verify();
            await promoteNpm(version, transport);
        },
    };
}
