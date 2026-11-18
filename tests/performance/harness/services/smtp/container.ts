import { randomBytes, createHash } from "node:crypto";
import { resolve } from "node:path";
import { waitForHttp } from "../../../../integration/instance/docker";
import { smtpControl } from "./client";
import type { ContainerCluster } from "../../../../integration/instance/containers/cluster";
import type { SmtpService } from "./client";

export async function buildSmtpProgram() {
    const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, "server.ts")], target: "bun" });
    if (!built.success || built.outputs.length !== 1) {
        throw new Error("Cannot compile controlled SMTP service");
    }
    const program = await built.outputs[0]!.text();
    return {
        program,
        profile: {
            programDigest: createHash("sha256").update(program).digest("hex"),
            cpus: 0.25,
            memoryBytes: 256 * 1024 ** 2,
        },
    };
}

export async function startSmtpService(
    cluster: ContainerCluster,
    image: string,
    built: Awaited<ReturnType<typeof buildSmtpProgram>>,
): Promise<SmtpService> {
    const key = randomBytes(32).toString("base64url");
    const password = randomBytes(32).toString("base64url");
    const name = `${cluster.id}-smtp`;
    await cluster.run(
        name,
        "performance-smtp",
        image,
        [
            "--publish",
            "127.0.0.1::8054",
            "--entrypoint",
            "bun",
            "--cpus",
            String(built.profile.cpus),
            "--memory",
            String(built.profile.memoryBytes),
            "--memory-swap",
            String(built.profile.memoryBytes),
            "--env",
            `ULVIA_TEST_SMTP_KEY=${key}`,
            "--env",
            `ULVIA_TEST_SMTP_PASSWORD=${password}`,
        ],
        ["-e", built.program],
        false,
    );
    const origin = await cluster.endpoint(name, 8054);
    await waitForHttp(`${origin}/readyz`);
    return {
        control: smtpControl(origin, key),
        connection: { host: "performance-smtp", port: 2525, secure: false, username: "performance", password },
    };
}
