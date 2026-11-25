import { expect } from "bun:test";
import { join } from "node:path";
import { publishDistribution } from "../../../../infra/distribution/publish";
import type { PublicationPorts } from "../../../../infra/distribution/publish";
import type { PublicationPhase } from "../../../../infra/distribution/options";
import { distributionFixture } from "../fixture";

export async function publicationFixture() {
    const f = await distributionFixture();
    const calls: string[] = [];
    const remote = new Set<string>();
    let fail = "";
    let cli = false;
    let promoted = false;
    const dependencies: PublicationPorts = {
        images: async () => {
            calls.push("inspect");
            return f.images;
        },
        remoteImages: async () => {
            calls.push("images-preflight");
            if (fail === "images-preflight") {
                throw new Error("remote image conflict");
            }
            return {
                publish: async () => {
                    for (const image of f.images) {
                        if (!remote.has(image.component)) {
                            calls.push(`push-${image.component}`);
                            if (fail === image.component) {
                                throw new Error("image publication failed");
                            }
                            remote.add(image.component);
                        }
                    }
                },
                verify: async () => {
                    calls.push("verify-images");
                    if (remote.size !== 2) {
                        throw new Error("runtime images missing");
                    }
                },
            };
        },
        repository: async (root) => {
            expect(root).toBe(join(f.destination, "repository"));
            calls.push("repository-preflight");
            if (fail === "repository-preflight") {
                throw new Error("Repository unavailable");
            }
            return {
                url: "https://repository.example",
                coordinates: [],
                publish: async () => {
                    calls.push("catalogue");
                    if (fail === "catalogue") {
                        throw new Error("Repository request failed (409)");
                    }
                },
            };
        },
        npm: async (archive) => {
            expect(archive).toBe(f.archive);
            calls.push("npm-preflight");
            if (fail === "npm-preflight") {
                throw new Error("npm conflict");
            }
            return {
                publish: async () => {
                    calls.push("cli");
                    if (fail === "cli") {
                        throw new Error("CLI publication failed");
                    }
                    cli = true;
                },
                verify: async () => {
                    calls.push("verify-cli");
                    if (!cli) {
                        throw new Error("runtime CLI missing");
                    }
                },
                promote: async () => {
                    calls.push("promotion");
                    if (fail === "promotion") {
                        throw new Error("npm promotion failed");
                    }
                    promoted = true;
                },
            };
        },
        run: async (args) => {
            calls.push(args.join(" "));
            return "";
        },
    };
    return {
        ...f,
        calls,
        remote,
        dependencies,
        promoted: () => promoted,
        setFailure: (value: string) => {
            fail = value;
        },
        publish: (phase: PublicationPhase = "all") => publishDistribution(f.root, f.version, {}, dependencies, phase),
    };
}
