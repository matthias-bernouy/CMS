import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const nginxConfig = resolve(root, "management-ingress.nginx.conf");
const bunImage = "oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0";
const nginxImage = "nginx:1.31.1-alpine@sha256:8b1e78743a03dbb2c95171cc58639fef29abc8816598e27fb910ed2e621e589a";

const backendScript = `
Bun.serve({
    hostname: "0.0.0.0",
    port: 3000,
    fetch(request) {
        const url = new URL(request.url);
        const observation = {
            method: request.method,
            path: url.pathname,
            query: Object.fromEntries(url.searchParams),
            authorization: request.headers.get("authorization"),
        };
        console.log(JSON.stringify(observation));
        return Response.json(observation);
    },
});
`;

const clientScript = `
const origin = "http://management-ingress:8080";
const requests = [
    ["allowed", "GET", "/.cms/repository-management/api/integrations/versions?kind=commerce", true],
    ["maintenance", "POST", "/.cms/repository-management/api/integrations/schema-baselines", false],
    ["worker", "GET", "/.cms/repository-management/api/integrations/verification-jobs", false],
    ["public", "GET", "/.cms/repository/api/integrations", false],
    ["wrong-method", "POST", "/.cms/repository-management/api/integrations/versions?kind=commerce", false],
];
const results = [];
for (const [name, method, path, authorize] of requests) {
    const response = await fetch(origin + path, {
        method,
        headers: authorize ? { authorization: "Bearer behavior-token" } : undefined,
    });
    results.push({ name, status: response.status, body: await response.text() });
}
process.stdout.write(JSON.stringify(results));
`;

const dockerAvailable = command(["info"], false).exitCode === 0;
const dockerTest = dockerAvailable ? test : test.skip;

dockerTest(
    "forwards only allow-listed management requests to the repository listener",
    async () => {
        const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
        const network = `cms-repository-ingress-test-${suffix}`;
        const backend = `cms-repository-mock-${suffix}`;
        const ingress = `cms-repository-ingress-${suffix}`;
        try {
            checked(["network", "create", "--internal", network]);
            checked([
                "run",
                "--detach",
                "--name",
                backend,
                "--network",
                network,
                "--network-alias",
                "cms-repository",
                "--read-only",
                "--tmpfs",
                "/tmp:rw,nosuid,nodev,noexec,size=16m,mode=0700,uid=1000,gid=1000",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges:true",
                "--pids-limit",
                "32",
                "--memory",
                "128m",
                "--cpus",
                "0.5",
                "--user",
                "1000:1000",
                "--entrypoint",
                "bun",
                bunImage,
                "-e",
                backendScript,
            ]);
            checked([
                "run",
                "--detach",
                "--name",
                ingress,
                "--network",
                network,
                "--network-alias",
                "management-ingress",
                "--read-only",
                "--tmpfs",
                "/tmp:rw,nosuid,nodev,noexec,size=16m,mode=0700,uid=101,gid=101",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges:true",
                "--pids-limit",
                "32",
                "--memory",
                "64m",
                "--cpus",
                "0.25",
                "--user",
                "101:101",
                "--volume",
                `${nginxConfig}:/etc/nginx/nginx.conf:ro`,
                "--entrypoint",
                "/usr/sbin/nginx",
                nginxImage,
                "-g",
                "daemon off;",
            ]);
            await waitForIngress(network);

            const results = JSON.parse(runClient(network, clientScript)) as Array<{
                name: string;
                status: number;
                body: string;
            }>;
            const allowed = results.find(({ name }) => name === "allowed");
            expect(allowed?.status).toBe(200);
            expect(JSON.parse(allowed?.body ?? "null")).toEqual({
                method: "GET",
                path: "/.cms/repository-management/api/integrations/versions",
                query: { kind: "commerce" },
                authorization: "Bearer behavior-token",
            });
            expect(results.filter(({ name }) => name !== "allowed").map(({ status }) => status)).toEqual([
                404, 404, 404, 404,
            ]);

            const observations = checked(["logs", backend])
                .stdout.split("\n")
                .filter((line) => line.startsWith('{"method"'));
            expect(observations).toHaveLength(2);
            expect(JSON.parse(observations[0]!)).toMatchObject({
                method: "GET",
                path: "/.cms/repository-management/api/status",
                authorization: "Bearer readiness-token",
            });
            expect(JSON.parse(observations[1]!)).toEqual(JSON.parse(allowed!.body));
        } finally {
            command(["rm", "--force", ingress, backend], false);
            command(["network", "rm", network], false);
        }
    },
    30_000,
);

async function waitForIngress(network: string): Promise<void> {
    const probe = `
const response = await fetch("http://management-ingress:8080/.cms/repository-management/api/status", {
    headers: { authorization: "Bearer readiness-token" },
});
if (response.status !== 200) process.exit(1);
`;
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (runClientResult(network, probe).exitCode === 0) {
            return;
        }
        await Bun.sleep(100);
    }
    throw new Error("Management ingress did not become ready");
}

function runClient(network: string, script: string): string {
    return checked(clientArguments(network, script)).stdout;
}

function runClientResult(network: string, script: string): ReturnType<typeof command> {
    return command(clientArguments(network, script), false);
}

function clientArguments(network: string, script: string): string[] {
    return ["run", "--rm", "--network", network, "--entrypoint", "bun", bunImage, "-e", script];
}

function checked(args: string[]): ReturnType<typeof command> {
    const result = command(args, true);
    if (result.exitCode !== 0) {
        throw new Error(`Docker command failed: ${result.stderr.trim()}`);
    }
    return result;
}

function command(args: string[], capture = true) {
    const result = Bun.spawnSync({
        cmd: ["docker", ...args],
        cwd: root,
        stdout: capture ? "pipe" : "ignore",
        stderr: capture ? "pipe" : "ignore",
    });
    return {
        exitCode: result.exitCode,
        stdout: capture ? result.stdout.toString() : "",
        stderr: capture ? result.stderr.toString() : "",
    };
}
