import { compareSemVer } from "@bernouy/ulvia-contracts/compatibility";
import { isReleaseVersion } from "../options";
import { CLI_PACKAGE, NPM_REGISTRY, npmMetadata } from "./registry";
import type { NpmTransport } from "./registry";

export async function promoteNpm(version: string, transport: NpmTransport): Promise<void> {
    const tag = version.includes("-") ? "next" : "latest";
    async function current(): Promise<string | undefined> {
        const values = await npmMetadata("-/package/@cyaxis%2Fulvia/dist-tags", transport);
        if (!values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).length > 8192) {
            throw new Error("Invalid npm dist-tags response");
        }
        const value = (values as Record<string, unknown>)[tag];
        if (value !== undefined && !isReleaseVersion(value)) {
            throw new Error(`Invalid npm ${tag} version`);
        }
        if (typeof value === "string" && compareSemVer(value, version) > 0) {
            throw new Error(`Refusing to move npm ${tag} backwards from ${value} to ${version}`);
        }
        return value as string | undefined;
    }
    if ((await current()) === version) {
        return;
    }
    let uncertain: unknown;
    try {
        await transport.run([
            "npm",
            "dist-tag",
            "add",
            `${CLI_PACKAGE}@${version}`,
            tag,
            "--registry",
            NPM_REGISTRY,
            `--@cyaxis:registry=${NPM_REGISTRY}`,
        ]);
    } catch (error) {
        uncertain = error;
    }
    if ((await current()) !== version) {
        throw new Error(`npm ${tag} promotion is not confirmed; retry the catalogue phase`, { cause: uncertain });
    }
}
