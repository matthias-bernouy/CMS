import { join } from "node:path";

type Component = "kernel" | "provider" | "repository";

const REPOSITORIES: Record<Component, string> = {
    kernel: "docker.io/cyaxis/ulvia-kernel",
    provider: "docker.io/cyaxis/ulvia-provider",
    repository: "docker.io/cyaxis/ulvia-official-repository",
};

const DOCKERFILES: Record<Component, string> = {
    kernel: "infra/images/kernel/Dockerfile",
    provider: "infra/images/provider/Dockerfile",
    repository: "infra/images/official-repository/Dockerfile",
};

const [action, ...args] = Bun.argv.slice(2);
const options = parseOptions(args);
const components = options.component === "all" ? (Object.keys(REPOSITORIES) as Component[]) : [options.component];
const revision = (await command(["git", "rev-parse", "HEAD"], false)).trim();

for (const component of components) {
    const reference = `${REPOSITORIES[component]}:${options.version}`;
    if (action === "build") {
        await command([
            "docker",
            "build",
            "--build-arg",
            `IMAGE_VERSION=${options.version}`,
            "--build-arg",
            `VCS_REF=${revision}`,
            "--file",
            join(process.cwd(), DOCKERFILES[component]),
            "--tag",
            reference,
            process.cwd(),
        ]);
        await verifyImage(reference, component, options.version);
    } else if (action === "publish") {
        await verifyImage(reference, component, options.version);
        await command(["docker", "push", reference]);
    } else {
        throw new Error(usage());
    }
}

async function verifyImage(reference: string, component: Component, version: string): Promise<void> {
    const source = await command(["docker", "image", "inspect", reference], false);
    const values = JSON.parse(source) as Array<{ Config?: { Labels?: Record<string, string> } }>;
    const labels = values[0]?.Config?.Labels;
    if (
        values.length !== 1 ||
        labels?.["io.ulvia.component"] !== component ||
        labels?.["io.ulvia.stack-api"] !== "1" ||
        labels?.["org.opencontainers.image.version"] !== version
    ) {
        throw new Error(`Refusing invalid ${component} image: ${reference}`);
    }
}

function parseOptions(args: readonly string[]): Readonly<{ version: string; component: Component | "all" }> {
    const versionIndex = args.indexOf("--version");
    const version = versionIndex >= 0 ? args[versionIndex + 1] : undefined;
    const positional = args.filter((value, index) => index !== versionIndex && index !== versionIndex + 1);
    const component = positional[0] ?? "all";
    if (
        !version ||
        !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u.test(version) ||
        !["all", "kernel", "provider", "repository"].includes(component) ||
        positional.length > 1
    ) {
        throw new Error(usage());
    }
    return { version, component: component as Component | "all" };
}

async function command(args: readonly string[], inherit = true): Promise<string> {
    const process = Bun.spawn([...args], {
        stdin: inherit ? "inherit" : "ignore",
        stdout: inherit ? "inherit" : "pipe",
        stderr: "inherit",
    });
    const [exitCode, output] = await Promise.all([
        process.exited,
        inherit ? Promise.resolve("") : new Response(process.stdout).text(),
    ]);
    if (exitCode !== 0) {
        throw new Error(`${args[0]} failed with exit code ${exitCode}`);
    }
    return output;
}

function usage(): string {
    return "Usage: bun run infra/images/build.ts <build | publish> --version <version> [kernel | provider | repository | all]";
}
