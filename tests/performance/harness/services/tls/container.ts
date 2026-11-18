import { mkdtemp, chmod, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { docker } from "../../../../integration/instance/docker";
import { CADDY_IMAGE } from "./configuration";
import type { tlsProgram } from "./configuration";
import type { ContainerCluster } from "../../../../integration/instance/containers/cluster";

/** Private Caddy CA and storage exist only for this disposable cluster; no public CA or host trust changes. */
export async function startTlsService(cluster: ContainerCluster, built: ReturnType<typeof tlsProgram>) {
    const metadata = JSON.parse((await docker(["image", "inspect", CADDY_IMAGE])).stdout);
    if (
        !metadata[0]?.RepoDigests?.some((value: string) => value.endsWith(CADDY_IMAGE.slice(CADDY_IMAGE.indexOf("@"))))
    ) {
        throw new Error("Controlled TLS image digest differs from its pinned identity");
    }
    const root = await mkdtemp(join(tmpdir(), `${cluster.id}-tls-`));
    const close = () => rm(root, { recursive: true, force: true });
    const name = `${cluster.id}-tls`;
    try {
        await chmod(root, 0o755);
        await writeFile(join(root, "caddy.json"), built.program, { mode: 0o644 });
        await cluster.run(
            name,
            "performance-tls",
            metadata[0].Id,
            [
                "--cpus",
                String(built.profile.cpus),
                "--memory",
                String(built.profile.memoryBytes),
                "--memory-swap",
                String(built.profile.memoryBytes),
                "--volume",
                `${root}:/ulvia-test-tls:ro`,
                "--tmpfs",
                "/data:rw,nosuid,nodev,noexec,size=32m",
                "--tmpfs",
                "/config:rw,nosuid,nodev,noexec,size=8m",
            ],
            ["caddy", "run", "--config", "/ulvia-test-tls/caddy.json"],
            false,
        );
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            const found = await docker(
                ["exec", name, "test", "-f", "/data/caddy/pki/authorities/local/root.crt"],
                true,
            );
            if (found.code === 0) {
                ready = true;
                break;
            }
            await Bun.sleep(100);
        }
        if (!ready) {
            throw new Error("Controlled TLS CA did not become ready");
        }
        // Docker archive copying does not expose tmpfs files consistently; read this public CA through exec.
        const ca = (await docker(["exec", name, "cat", "/data/caddy/pki/authorities/local/root.crt"])).stdout;
        if (Buffer.byteLength(ca) > 64 * 1024 || !ca.includes("-----BEGIN CERTIFICATE-----")) {
            throw new Error("Controlled TLS CA is invalid");
        }
        await writeFile(join(root, "root.crt"), ca, { mode: 0o644 });
        const info = JSON.parse((await docker(["inspect", name])).stdout);
        const address = info[0]?.NetworkSettings?.Networks?.[cluster.id]?.IPAddress;
        if (typeof address !== "string" || !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(address)) {
            throw new Error("Controlled TLS service has no isolated address");
        }
        return {
            control: { address },
            providerOptions: [
                "--env",
                'ULVIA_TLS_ENTRYPOINTS=[{"host":"performance-tls","port":443}]',
                "--env",
                `ULVIA_TLS_PUBLIC_ADDRESSES=${JSON.stringify([address])}`,
                "--env",
                "ULVIA_TLS_TRUST_FILE=/ulvia-test-tls/root.crt",
                "--volume",
                `${root}:/ulvia-test-tls:ro`,
            ],
            close,
        };
    } catch (error) {
        await close();
        throw error;
    }
}

export type TlsControl = Readonly<{ address: string }>;
