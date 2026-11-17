import { join } from "node:path";
import { command } from "../process";
import { isReleaseVersion } from "../distribution/options";
import { COMPONENTS, imageReference, inspectImage } from "./inspection";
import type { ImageComponent } from "./inspection";

const [action, ...args] = Bun.argv.slice(2);
if (action !== "build") {
    throw new Error(usage());
}
const options = parseOptions(args);
const components = options.component === "all" ? COMPONENTS : [options.component];
const revision = (await command(["git", "rev-parse", "HEAD"], { capture: true })).trim();

for (const component of components) {
    await command([
        "docker",
        "build",
        "--build-arg",
        `IMAGE_VERSION=${options.version}`,
        "--build-arg",
        `VCS_REF=${revision}`,
        "--file",
        join(process.cwd(), "infra/images", component, "Dockerfile"),
        "--tag",
        imageReference(component, options.version),
        process.cwd(),
    ]);
    await inspectImage(component, options.version, revision);
}

function parseOptions(args: readonly string[]): { version: string; component: ImageComponent | "all" } {
    const versionIndex = args.indexOf("--version");
    const version = args[versionIndex + 1];
    const positional = args.filter((_, index) => index !== versionIndex && index !== versionIndex + 1);
    const component = positional[0] ?? "all";
    if (
        versionIndex < 0 ||
        !isReleaseVersion(version) ||
        ![...COMPONENTS, "all"].includes(component) ||
        positional.length > 1
    ) {
        throw new Error(usage());
    }
    return { version, component: component as ImageComponent | "all" };
}

function usage(): string {
    return "Usage: bun run infra/images/build.ts build --version <version> [edge | provider | all]";
}
