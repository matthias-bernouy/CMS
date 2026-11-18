import { createHash } from "node:crypto";
import { createCaddyHostingConfiguration } from "@bernouy/hosting/caddy";

export const CADDY_IMAGE =
    "caddy:2.11.9-alpine@sha256:0bbb055bda6793c999bde78b1b5ce3e89f829fb031af2cf50056ea1246559fee";

/** Real on-demand issuance calls the same public permission mount measured by the scenarios. */
export function tlsProgram() {
    const configuration = createCaddyHostingConfiguration({
        permissionUrl: "http://ulvia-provider:5103/hosting/tls/permission",
        upstreams: ["edge:3000"],
        storageRoot: "/data/caddy",
        tls: { issuer: "internal" },
    });
    const program = JSON.stringify(configuration);
    return {
        program,
        profile: {
            programDigest: createHash("sha256").update(CADDY_IMAGE).update(program).digest("hex"),
            cpus: 0.25,
            memoryBytes: 128 * 1024 ** 2,
        },
    };
}
