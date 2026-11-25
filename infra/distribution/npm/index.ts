import { fileHash } from "../files";
import { command } from "../../process";
import { CLI_PACKAGE, NPM_REGISTRY, verifyNpmVersion } from "./registry";
import type { NpmTransport } from "./registry";
import { promoteNpm } from "./tags";
export type { NpmTransport } from "./registry";

export async function prepareNpmPublication(
    archive: string,
    version: string,
    transport: NpmTransport = { fetch, run: command },
) {
    const integrity = `sha512-${await fileHash(archive, "sha512", "base64")}`;
    await verifyNpmVersion(version, integrity, transport);
    async function verify(): Promise<void> {
        if (!(await verifyNpmVersion(version, integrity, transport))) {
            throw new Error(`Runtime CLI ${CLI_PACKAGE}@${version} is not published; run the runtime phase first`);
        }
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
            if (!(await verifyNpmVersion(version, integrity, transport))) {
                throw new Error("npm publication is not confirmed; retry the runtime phase", { cause: uncertain });
            }
        },
        promote: async () => {
            await verify();
            await promoteNpm(version, transport);
        },
    };
}
