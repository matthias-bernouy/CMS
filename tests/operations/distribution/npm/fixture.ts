import { distributionFixture } from "../fixture";
import { fileHash } from "../../../../infra/distribution/files";
import type { NpmTransport } from "../../../../infra/distribution/npm";

export async function npmFixture(version = "1.2.3") {
    const f = await distributionFixture(version);
    const integrity = `sha512-${await fileHash(f.archive, "sha512", "base64")}`;
    const tags: Record<string, string> = { latest: "1.0.0", next: "1.1.0-beta.1" };
    const calls: readonly string[][] = [];
    let stored = false;
    let uncertain = false;
    const transport: NpmTransport = {
        fetch: async (url, options) => {
            if (options.redirect !== "error") {
                throw new Error("Redirect protection missing");
            }
            if (url.endsWith("/dist-tags")) {
                return Response.json(tags);
            }
            return stored
                ? Response.json({ name: "@cyaxis/ulvia", version, dist: { integrity } })
                : new Response(null, { status: 404 });
        },
        run: async (args) => {
            (calls as string[][]).push([...args]);
            if (args[0] === "bun") {
                stored = true;
                tags[args[args.indexOf("--tag") + 1]!] = version;
            } else {
                tags[args[4]!] = version;
            }
            if (uncertain) {
                throw new Error("Lost response after server commit");
            }
        },
    };
    return {
        ...f,
        integrity,
        tags,
        calls,
        transport,
        stored: () => stored,
        setStored: () => {
            stored = true;
        },
        setUncertain: () => {
            uncertain = true;
        },
    };
}
