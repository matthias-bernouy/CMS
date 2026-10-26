import { expect, test } from "bun:test";
import { resolve } from "node:path";

const definitions = resolve(import.meta.dir, "../../../src/runtime/stack/orchestration/definitions");
const dockerAvailable = commandSucceeds(["docker", "compose", "version"]);
const composeTest = dockerAvailable ? test : test.skip;

composeTest("one Compose model renders loopback HTTP and public ACME exposure", () => {
    const base = render(["services.yml"]);
    expect(Object.keys(base.services).sort()).toEqual(["mongo", "mongo-provision", "provider", "proxy", "repository"]);
    expect(base.services.proxy.ports).toEqual([
        { mode: "ingress", host_ip: "127.0.0.1", target: 80, published: "15100", protocol: "tcp" },
    ]);
    expect(base.services.provider.environment.MODE).toBe("PROD");
    expect(base.services.provider.environment.CMS_REPOSITORY_URL).toBe("https://repo.ulvia.fr");
    expect(base.services.provider.environment.CMS_REPOSITORY_ALLOW_INSECURE_HTTP).toBe("false");
    expect(base.services.provider.environment.MONGO_URL).toContain("ulvia_provider:bbbb");
    expect(base.services.provider.environment.MONGO_URL).not.toContain("ulvia:aaaa");
    expect(base.services.mongo.ports).toBeUndefined();
    expect(base.services.proxy.volumes).toContainEqual(
        expect.objectContaining({ type: "volume", target: "/var/cache/nginx" }),
    );

    const tls = render(["services.yml", "services-tls.yml"]);
    expect(Object.keys(tls.services).sort()).toEqual([
        "acme",
        "mongo",
        "mongo-provision",
        "provider",
        "proxy",
        "repository",
    ]);
    expect(tls.services.proxy.ports).toHaveLength(2);
    expect(tls.services.proxy.ports?.[1]).toMatchObject({ host_ip: "127.0.0.1", target: 443, published: "15443" });
    expect(tls.services.acme.environment.DEFAULT_EMAIL).toBe("ops@example.com");
});

composeTest("one isolated Kernel receives no shared persistence credentials", () => {
    const config = render(["kernel.yml", "kernel-tls.yml"]);
    expect(Object.keys(config.services)).toEqual(["kernel"]);
    const kernel = config.services.kernel;
    expect(kernel.environment).toMatchObject({
        MODE: "PROD",
        KERNEL_PUBLIC_URL: "https://example.com",
        CMS_INSTALLATIONS_PROVIDER_URL: "http://ulvia-provider:5103",
        ACME_HOST: "example.com",
    });
    for (const secret of ["MONGO_URL", "CMS_SESSION_SECRET", "CMS_KEK_HEX", "ULVIA_PROVIDER_OPERATOR_TOKEN"]) {
        expect(kernel.environment[secret]).toBeUndefined();
    }
    expect(kernel.read_only).toBe(true);
    expect(kernel.cap_drop).toEqual(["ALL"]);
});

composeTest("standalone Repository uses owner publication and exposes only its TLS proxy publicly", () => {
    const local = render(["repository.yml"]);
    expect(Object.keys(local.services)).toEqual(["repository"]);
    expect(local.services.repository.ports?.[0]).toMatchObject({ host_ip: "127.0.0.1", target: 3000 });
    expect(local.services.repository.environment.ULVIA_REPOSITORY_TOKEN).toBeUndefined();
    expect(local.services.repository.environment.REPOSITORY_PUBLIC_URL).toBe("https://repository.example");
    const tls = render(["repository.yml", "repository-tls.yml"]);
    expect(Object.keys(tls.services).sort()).toEqual(["acme", "proxy", "repository"]);
    expect(tls.services.proxy.ports).toEqual([
        expect.objectContaining({ host_ip: "0.0.0.0", target: 80, published: "80" }),
        expect.objectContaining({ host_ip: "0.0.0.0", target: 443, published: "443" }),
    ]);
    expect(tls.services.repository.environment.LETSENCRYPT_HOST).toBe("repository.example");
    expect(tls.services.acme.environment.DEFAULT_EMAIL).toBe("ops@example.com");
});

type RenderedService = {
    environment: Record<string, string>;
    ports?: Array<Record<string, unknown>>;
    read_only?: boolean;
    cap_drop?: string[];
    volumes?: Array<Record<string, unknown>>;
};

type RenderedCompose = { services: Record<string, RenderedService> };

function render(files: readonly string[], overrides: Record<string, string> = {}): RenderedCompose {
    const result = Bun.spawnSync({
        cmd: [
            "docker",
            "compose",
            "--env-file",
            "/dev/null",
            ...files.flatMap((file) => ["--file", resolve(definitions, file)]),
            "config",
            "--format",
            "json",
        ],
        cwd: definitions,
        env: { ...minimalEnvironment(), ...composeEnvironment(), ...overrides },
        stdout: "pipe",
        stderr: "pipe",
    });
    if (result.exitCode !== 0) {
        throw new Error(result.stderr.toString());
    }
    return JSON.parse(result.stdout.toString()) as RenderedCompose;
}

function composeEnvironment(): Record<string, string> {
    return {
        PROVIDER_IMAGE: "ulvia-provider:test",
        OFFICIAL_REPOSITORY_IMAGE: "ulvia-official-repository:test",
        KERNEL_IMAGE: "ulvia-kernel:test",
        ULVIA_BIND_ADDRESS: "127.0.0.1",
        ULVIA_HTTP_PORT: "15100",
        ULVIA_HTTPS_PORT: "15443",
        ULVIA_PROVIDER_PORT: "15103",
        ULVIA_REPOSITORY_PORT: "15102",
        ULVIA_UID: "1000",
        ULVIA_GID: "1000",
        ULVIA_PRIVATE_NETWORK: "ulvia-test-private",
        ULVIA_INSTANCE_NETWORK: "ulvia-test-instances",
        ULVIA_MONGO_DIR: "/tmp/ulvia-test/mongo",
        ULVIA_FILES_DIR: "/tmp/ulvia-test/files",
        ULVIA_REPOSITORY_DIR: "/tmp/ulvia-test/repository",
        ULVIA_LOGS_DIR: "/tmp/ulvia-test/logs",
        ULVIA_PROXY_CERTIFICATES_DIR: "/tmp/ulvia-test/proxy/certificates",
        ULVIA_PROXY_VHOST_DIR: "/tmp/ulvia-test/proxy/vhosts",
        ULVIA_PROXY_CHALLENGE_DIR: "/tmp/ulvia-test/proxy/challenge",
        ULVIA_PROXY_ACME_DIR: "/tmp/ulvia-test/proxy/acme",
        ULVIA_MONGO_USERNAME: "ulvia",
        ULVIA_MONGO_PASSWORD: "a".repeat(43),
        ULVIA_MONGO_PROVIDER_USERNAME: "ulvia_provider",
        ULVIA_MONGO_PROVIDER_PASSWORD: "b".repeat(43),
        ULVIA_PROVIDER_SESSION_SECRET: "c".repeat(43),
        ULVIA_PROVIDER_KEK_HEX: "d".repeat(64),
        ULVIA_REPOSITORY_PUBLIC_URL: "https://repository.example",
        ULVIA_REPOSITORY_DOMAIN: "repository.example",
        ULVIA_REPOSITORY_PROXY_DIR: "/tmp/ulvia-test/repository-proxy",
        ULVIA_PROVIDER_OPERATOR_TOKEN: "f".repeat(43),
        ULVIA_ACME_EMAIL: "ops@example.com",
        ULVIA_INSTANCE_HOSTNAME: "example.com",
        ULVIA_INSTANCE_URL: "https://example.com",
        CMS_INSTALLATIONS_PROVIDER_TOKEN: "g".repeat(43),
    };
}

function minimalEnvironment(): Record<string, string> {
    return { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp" };
}

function commandSucceeds(command: string[]): boolean {
    return (
        Bun.spawnSync({ cmd: command, env: minimalEnvironment(), stdout: "ignore", stderr: "ignore" }).exitCode === 0
    );
}

composeTest("an explicit local Repository override reaches the Provider without contacting the public service", () => {
    const config = render(["services.yml"], {
        CMS_REPOSITORY_URL: "http://repository:3000",
        CMS_REPOSITORY_ALLOW_INSECURE_HTTP: "true",
    });
    expect(config.services.provider.environment.CMS_REPOSITORY_URL).toBe("http://repository:3000");
    expect(config.services.provider.environment.CMS_REPOSITORY_ALLOW_INSECURE_HTTP).toBe("true");
});
