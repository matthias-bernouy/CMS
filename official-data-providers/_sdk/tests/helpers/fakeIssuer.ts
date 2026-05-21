import { SignJWT, generateKeyPair, exportJWK } from "jose";
import {
    DATA_PROVIDER_CONTRACT_VERSION,
    METADOC_VERSION_FIELD,
} from "@bernouy/data-provider-contract";

/**
 * Test double for an issuer (proxy/hub). Serves an RFC 8414 metadoc + JWKS
 * over an ephemeral port and mints ES256 tokens. Exposes the knobs the
 * security matrix (09) needs: key rotation, orphan key, cross-origin
 * `jwks_uri` (SSRF), bad contract version, malicious `alg`, clock skew.
 */
interface SigningKey { kid: string; priv: CryptoKey; jwk: Record<string, unknown>; }

export interface MintOpts {
    aud:   string;
    sub?:  string;
    iss?:  string;          // override (default = this issuer)
    iat?:  number;          // epoch seconds (default now)
    exp?:  number;          // epoch seconds (default now + 120)
    jti?:  string;
    kid?:  string;          // which key (default = active)
    alg?:  string;          // header alg override ("HS256" / "none" attacks)
}

export class FakeIssuer {
    private server!: ReturnType<typeof Bun.serve>;
    private keys: SigningKey[] = [];
    private activeKid!: string;
    private jwksUriOverride: string | null = null;
    private contractVersion: string = DATA_PROVIDER_CONTRACT_VERSION;
    private metadocStatus = 200;

    static async start(): Promise<FakeIssuer> {
        const fi = new FakeIssuer();
        await fi.addKey();
        fi.server = Bun.serve({ port: 0, fetch: (r) => fi.handle(r) });
        return fi;
    }

    get iss(): string { return `http://127.0.0.1:${this.server.port}`; }
    get jwksUri(): string { return this.jwksUriOverride ?? `${this.iss}/jwks.json`; }

    /** Add a new key and make it active; old keys stay in the JWKS (overlap). */
    async rotateKey(): Promise<string> { return this.addKey(); }
    /** Remove a key from the JWKS → tokens signed with it become orphaned. */
    dropKey(kid: string): void { this.keys = this.keys.filter((k) => k.kid !== kid); }
    setJwksUri(url: string | null): void { this.jwksUriOverride = url; }
    setContractVersion(v: string): void { this.contractVersion = v; }
    /** Make the metadoc endpoint return a non-2xx status. */
    failMetadoc(status = 503): void { this.metadocStatus = status; }
    stop(): void { this.server.stop(true); }

    private async addKey(): Promise<string> {
        const kid = `k${this.keys.length + 1}`;
        const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
        const jwk = { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" };
        this.keys.push({ kid, priv: privateKey, jwk });
        this.activeKid = kid;
        return kid;
    }

    async mint(o: MintOpts): Promise<string> {
        const iss = o.iss ?? this.iss;
        const iat = o.iat ?? Math.floor(Date.now() / 1000);
        const exp = o.exp ?? iat + 120;
        const kid = o.kid ?? this.activeKid;
        const alg = o.alg ?? "ES256";
        const payload: Record<string, unknown> = { jti: o.jti ?? crypto.randomUUID() };
        if (o.sub) payload["sub"] = o.sub;

        if (alg === "none") {
            const enc = (x: unknown) => Buffer.from(JSON.stringify(x)).toString("base64url");
            return `${enc({ alg: "none", typ: "JWT" })}.${enc({ ...payload, iss, aud: o.aud, iat, exp })}.`;
        }
        const jwt = new SignJWT(payload)
            .setProtectedHeader({ alg, kid })
            .setIssuer(iss).setAudience(o.aud).setIssuedAt(iat).setExpirationTime(exp);
        if (alg === "HS256") {
            return jwt.sign(new TextEncoder().encode("attacker-controlled-secret"));
        }
        const key = this.keys.find((k) => k.kid === kid);
        if (!key) throw new Error(`mint: unknown kid ${kid} (orphan? use a real kid)`);
        return jwt.sign(key.priv);
    }

    private handle(req: Request): Response {
        const path = new URL(req.url).pathname;
        if (path === "/.well-known/oauth-authorization-server") {
            if (this.metadocStatus !== 200) {
                return new Response("metadoc error", { status: this.metadocStatus });
            }
            return Response.json({
                issuer: this.iss,
                jwks_uri: this.jwksUri,
                signing_alg_values_supported: ["ES256"],
                [METADOC_VERSION_FIELD]: this.contractVersion,
            });
        }
        if (path === "/jwks.json") {
            return Response.json({ keys: this.keys.map((k) => k.jwk) });
        }
        return new Response("not found", { status: 404 });
    }
}
