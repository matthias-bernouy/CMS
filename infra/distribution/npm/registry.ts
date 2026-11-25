import { metadataJson } from "../metadata";
import type { CommandOptions } from "../../process";

export const NPM_REGISTRY = "https://registry.npmjs.org/";
export const CLI_PACKAGE = "@cyaxis/ulvia";
export type NpmTransport = {
    fetch: (url: string, options: RequestInit) => Promise<Response>;
    run: (args: readonly string[], options?: CommandOptions) => Promise<unknown>;
};

export async function npmMetadata(path: string, transport: NpmTransport): Promise<unknown> {
    const response = await transport.fetch(`${NPM_REGISTRY}${path}`, {
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: { "cache-control": "no-cache" },
    });
    if (response.status === 404) {
        await response.body?.cancel();
        return undefined;
    }
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`npm metadata request failed (${response.status})`);
    }
    return metadataJson(response, 1_048_576, "npm");
}

export async function verifyNpmVersion(version: string, integrity: string, transport: NpmTransport): Promise<boolean> {
    const value = (await npmMetadata(`@cyaxis%2Fulvia/${version}`, transport)) as
        | {
              name?: unknown;
              version?: unknown;
              dist?: { integrity?: unknown };
          }
        | undefined;
    if (value === undefined) {
        return false;
    }
    if (value?.name !== CLI_PACKAGE || value.version !== version || value.dist?.integrity !== integrity) {
        throw new Error(`npm version ${version} already exists with different bytes`);
    }
    return true;
}
