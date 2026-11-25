import { metadataJson } from "../metadata";
import type { NpmConfirmationClock } from "./confirmation";
import type { CommandOptions } from "../../process";

export const NPM_REGISTRY = "https://registry.npmjs.org/";
export const CLI_PACKAGE = "@cyaxis/ulvia";
export type NpmTransport = {
    fetch: (url: string, options: RequestInit) => Promise<Response>;
    confirmation?: NpmConfirmationClock;
    run: (args: readonly string[], options?: CommandOptions) => Promise<unknown>;
};

export class NpmMetadataUnavailableError extends Error {}

export async function npmMetadata(path: string, transport: NpmTransport, signal?: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
        response = await transport.fetch(`${NPM_REGISTRY}${path}`, {
            redirect: "error",
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
            headers: { "cache-control": "no-cache" },
        });
    } catch (cause) {
        throw new NpmMetadataUnavailableError("npm metadata request could not complete", { cause });
    }
    if (response.status === 404) {
        await response.body?.cancel();
        return undefined;
    }
    if (!response.ok) {
        await response.body?.cancel();
        const Failure = [429, 500, 502, 503, 504].includes(response.status) ? NpmMetadataUnavailableError : Error;
        throw new Failure(`npm metadata request failed (${response.status})`);
    }
    return metadataJson(response, 1_048_576, "npm");
}

export async function verifyNpmVersion(
    version: string,
    integrity: string,
    transport: NpmTransport,
    signal?: AbortSignal,
): Promise<boolean> {
    const value = (await npmMetadata(`@cyaxis%2Fulvia/${version}`, transport, signal)) as
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
