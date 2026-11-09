import { connect } from "node:tls";
import { open } from "node:fs/promises";
import type { TlsEntrypoint } from "./configuration";

export async function readTlsTrust(path?: string): Promise<string | undefined> {
    if (!path) {
        return undefined;
    }
    const file = await open(path, "r");
    try {
        const metadata = await file.stat();
        if (!metadata.isFile() || metadata.size > 65536) {
            throw new TypeError("TLS trust file must be at most 64 KiB");
        }
        const buffer = Buffer.alloc(65537);
        const { bytesRead } = await file.read(buffer);
        if (bytesRead > 65536) {
            throw new TypeError("TLS trust file grew beyond 64 KiB");
        }
        const value = buffer.subarray(0, bytesRead).toString("utf8");
        if (!value.includes("-----BEGIN CERTIFICATE-----")) {
            throw new TypeError("TLS trust file must contain a PEM certificate");
        }
        return value;
    } finally {
        await file.close();
    }
}

/** Connect only to operator-configured nodes; the tenant hostname supplies SNI, never a socket destination. */
export async function probeCertificate(
    nodes: readonly TlsEntrypoint[],
    hostname: string,
    signal: AbortSignal,
    ca?: string,
): Promise<boolean> {
    if (!nodes.length || signal.aborted) {
        return false;
    }
    const results = await Promise.all(
        nodes.map(
            (node) =>
                new Promise<boolean>((resolve) => {
                    if (signal.aborted) {
                        resolve(false);
                        return;
                    }
                    const socket = connect({
                        host: node.host,
                        port: node.port,
                        servername: hostname,
                        rejectUnauthorized: true,
                        minVersion: "TLSv1.2",
                        ...(ca ? { ca } : {}),
                    });
                    let completed = false;
                    const finish = (success: boolean) => {
                        if (completed) {
                            return;
                        }
                        completed = true;
                        clearTimeout(timeout);
                        signal.removeEventListener("abort", aborted);
                        socket.destroy();
                        resolve(success);
                    };
                    const aborted = () => finish(false);
                    const timeout = setTimeout(() => finish(false), 5000);
                    signal.addEventListener("abort", aborted, { once: true });
                    socket.once("secureConnect", () => finish(socket.authorized));
                    socket.once("error", () => finish(false));
                    socket.once("close", () => finish(false));
                }),
        ),
    );
    return results.every(Boolean);
}
