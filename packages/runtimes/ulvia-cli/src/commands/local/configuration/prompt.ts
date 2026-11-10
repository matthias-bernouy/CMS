import { createInterface } from "node:readline/promises";
import type { InstallationConfig } from "../../../runtime/stack/installation";

export async function promptConfiguration(current: InstallationConfig, locked: boolean): Promise<readonly string[]> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error(
            "Interactive configuration requires a terminal. Supply explicit options or use ulvia configure --show",
        );
    }
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    const args: string[] = [];
    const ask = async (flag: string, label: string, fallback: string) => {
        const value = (await terminal.question(`${label} [${fallback}]: `)).trim() || fallback;
        args.push(flag, value);
        return value;
    };
    try {
        if (!locked) {
            await ask("--domain", "Control hostname", new URL(current.hosting.controlOrigin).hostname);
            await ask("--bind", "Bind address", current.bindAddress);
            await ask("--http-port", "HTTP port", String(current.ports.http));
            const mode = await ask("--tls", "TLS mode (disabled/acme)", current.tls.mode);
            if (mode === "acme") {
                await ask(
                    "--https-port",
                    "HTTPS port",
                    String(current.tls.mode === "acme" ? current.tls.httpsPort : 443),
                );
                await ask("--acme-email", "ACME email", current.tls.mode === "acme" ? current.tls.email : "");
            }
        }
        await ask("--edges", "Shared Edge count", String(current.hosting.edgeCount));
        await ask(
            "--managed-suffixes",
            "Managed DNS suffixes (comma separated)",
            current.hosting.managedSuffixes.join(","),
        );
        await ask(
            "--public-addresses",
            "Public IP addresses (comma separated)",
            current.hosting.publicAddresses.join(","),
        );
        return args;
    } finally {
        terminal.close();
    }
}
