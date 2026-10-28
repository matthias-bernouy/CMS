import { requireExecutable, runCommand } from "../../process";

const SUPPORTED_STACK_API = "1";

export type OfficialImageComponent = "edge" | "provider" | "repository";

export type OfficialImage = Readonly<{
    component: OfficialImageComponent;
    version: string;
    digest: string;
}>;

const REPOSITORIES: Record<OfficialImageComponent, string> = {
    edge: "docker.io/cyaxis/ulvia-edge",
    provider: "docker.io/cyaxis/ulvia-provider",
    repository: "docker.io/cyaxis/ulvia-official-repository",
};

export async function pullOfficialImage(
    component: OfficialImageComponent,
    version: string,
    log: (message: string) => void,
): Promise<OfficialImage> {
    assertImageVersion(version);
    requireExecutable("docker");
    const reference = officialImageReference(component, version);
    log(`Pulling ${reference}...`);
    await runCommand(["docker", "pull", reference], { inherit: true });
    return await inspectOfficialImage(reference, component, version);
}

export async function ensureOfficialImage(image: OfficialImage): Promise<void> {
    requireExecutable("docker");
    const pinnedReference = pinnedOfficialImageReference(image);
    let inspected = await runCommand(["docker", "image", "inspect", pinnedReference], {
        allowFailure: true,
    });
    if (inspected.exitCode !== 0) {
        await runCommand(["docker", "pull", pinnedReference], { inherit: true });
        inspected = await runCommand(["docker", "image", "inspect", pinnedReference]);
    }
    const actual = parseOfficialImageInspection(inspected.stdout, image.component, image.version);
    if (actual.digest !== image.digest) {
        throw new Error(`Pinned ${image.component} image digest does not match the installed state`);
    }
}

export function officialImageReference(component: OfficialImageComponent, version: string): string {
    assertImageVersion(version);
    return `${REPOSITORIES[component]}:${version}`;
}

export function pinnedOfficialImageReference(image: OfficialImage): string {
    return `${REPOSITORIES[image.component]}@${image.digest}`;
}

export function parseOfficialImageInspection(
    source: string,
    component: OfficialImageComponent,
    version: string,
): OfficialImage {
    const values = JSON.parse(source) as unknown;
    if (!Array.isArray(values) || values.length !== 1 || !isRecord(values[0])) {
        throw new Error("Docker returned invalid image metadata");
    }
    const config = isRecord(values[0].Config) ? values[0].Config : null;
    const labels = config && isRecord(config.Labels) ? config.Labels : null;
    if (!labels) {
        throw new Error("Official Ulvia image has no OCI labels");
    }
    if (labels["io.ulvia.component"] !== component) {
        throw new Error(`Docker image is not the official Ulvia ${component} component`);
    }
    if (labels["io.ulvia.stack-api"] !== SUPPORTED_STACK_API) {
        throw new Error(`Ulvia ${component} image uses an unsupported stack API`);
    }
    if (labels["org.opencontainers.image.version"] !== version) {
        throw new Error(`Ulvia ${component} image version does not match the requested tag`);
    }
    const digests = values[0].RepoDigests;
    const digest = Array.isArray(digests)
        ? digests
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.match(/@(sha256:[a-f0-9]{64})$/u)?.[1])
              .find((value): value is string => Boolean(value))
        : undefined;
    if (!digest) {
        throw new Error("Official Ulvia image has no immutable repository digest");
    }
    return { component, version, digest };
}

export function assertImageVersion(version: string): void {
    if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u.test(version)) {
        throw new Error(`Invalid Ulvia image version: ${version}`);
    }
}

export function isOfficialImage(value: unknown, component: OfficialImageComponent): value is OfficialImage {
    if (!isRecord(value)) {
        return false;
    }
    if (typeof value.version !== "string") {
        return false;
    }
    try {
        assertImageVersion(value.version);
    } catch {
        return false;
    }
    return (
        value.component === component && typeof value.digest === "string" && /^sha256:[a-f0-9]{64}$/u.test(value.digest)
    );
}

async function inspectOfficialImage(
    reference: string,
    component: OfficialImageComponent,
    version: string,
): Promise<OfficialImage> {
    const inspected = await runCommand(["docker", "image", "inspect", reference]);
    return parseOfficialImageInspection(inspected.stdout, component, version);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
