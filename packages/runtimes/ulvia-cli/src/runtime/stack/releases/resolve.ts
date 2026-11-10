import { assertImageVersion } from "../orchestration/images";
import { embeddedStackRelease, sourceStackRelease } from "./local";
import { downloadStackRelease } from "./download";
import type { StackRelease } from "./model";

export async function resolveStackRelease(version: string, initial: boolean): Promise<StackRelease> {
    assertImageVersion(version);
    const embedded = embeddedStackRelease();
    if (embedded?.version === version) {
        return embedded;
    }
    // A source checkout can compose its own freshly built images on first deployment.
    if (!embedded && initial) {
        return sourceStackRelease(version);
    }
    return downloadStackRelease(version);
}
