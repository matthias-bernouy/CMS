export type LegoIssuerConfig = {
    /** Account email registered with the ACME provider. */
    email: string;
    /** Challenge type. `http` requires inbound port 80 reaching `lego` (or
     *  a webroot served by Nginx); `dns` requires `dnsProvider` + the
     *  provider's API credentials in `env`. */
    challenge: "http" | "dns";
    /** Required when `challenge === "dns"`. e.g. `"ovh"`, `"route53"`, `"cloudflare"`. */
    dnsProvider?: string;
    /** Extra env vars handed to `lego` — typically the DNS provider's API
     *  credentials. Merged on top of the parent process env. */
    env?: Record<string, string>;
    /** Path to the `lego` binary. Default: `"lego"` (looked up via `PATH`). */
    binary?: string;
    /** `--path` value: where lego stores certs + account state. Default: `/etc/lego`. */
    storePath?: string;
    /** Webroot to use when `challenge === "http"`, instead of `lego`'s built-in
     *  listener. Avoids port-80 conflicts when Nginx is already there. */
    httpWebroot?: string;
    /** ACME directory URL override. Default is lego's built-in (Let's Encrypt
     *  prod). Set to e.g. `https://acme-staging-v02.api.letsencrypt.org/directory`
     *  for staging tests so you don't burn the prod quota. */
    server?: string;
};

/** Issue a fresh certificate for `domain`. Idempotent in practice — re-running
 *  on a freshly-issued cert is a fast no-op since lego won't re-issue. */
export async function issueLegoCert(domain: string, cfg: LegoIssuerConfig): Promise<void> {
    await runLego([...baseArgs(domain, cfg), "run"], cfg);
}

/** Run `lego renew` for `domain`. lego decides whether the cert is close
 *  enough to expiry to warrant a new one — fast no-op otherwise. */
export async function renewLegoCert(domain: string, cfg: LegoIssuerConfig): Promise<void> {
    await runLego([...baseArgs(domain, cfg), "renew"], cfg);
}

// lego CLI: `lego [global options] command [command options]`. All our flags
// here are globals, so the subcommand MUST come last. Putting globals after
// `run`/`renew` causes lego to silently ignore them — notably `--path`,
// which falls back to `./.lego` and explodes on permission errors.
function baseArgs(domain: string, cfg: LegoIssuerConfig): string[] {
    const args = [
        "--accept-tos",
        "--email", cfg.email,
        "--domains", domain,
        "--path", cfg.storePath ?? "/etc/lego",
    ];
    if (cfg.server) args.push("--server", cfg.server);
    if (cfg.challenge === "http") {
        if (cfg.httpWebroot) args.push("--http", "--http.webroot", cfg.httpWebroot);
        else                 args.push("--http");
    } else {
        if (!cfg.dnsProvider) throw new Error("LegoIssuerConfig.dnsProvider is required for the dns challenge.");
        args.push("--dns", cfg.dnsProvider);
    }
    return args;
}

async function runLego(args: string[], cfg: LegoIssuerConfig): Promise<void> {
    const env = { ...process.env, ...(cfg.env ?? {}) };
    const proc = Bun.spawn([cfg.binary ?? "lego", ...args], { stdout: "pipe", stderr: "pipe", env });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`lego ${args[0]} failed (exit ${exitCode}): ${stderr.trim() || "no stderr captured"}`);
    }
}
