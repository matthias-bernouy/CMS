import type { ControlCms } from "src/control/ControlCms";
import MissingParam from "src/control/errors/Http/MissingParam";

/**
 * Sets the active mockup for a (providerId, method, path) operation.
 * All four fields come from query string so admin forms can rely on
 * `buildRequestUrl` query forwarding without needing JSON bodies. Pass
 * `name=` (empty value) to clear active for the operation.
 */
export default async function postProviderMockupActive(req: Request, cms: ControlCms) {
    const url        = new URL(req.url);
    const providerId = url.searchParams.get("providerId") ?? url.searchParams.get("id");
    const method     = url.searchParams.get("method");
    const path       = url.searchParams.get("path");
    const nameRaw    = url.searchParams.get("name");
    if (!providerId)    throw new MissingParam("providerId");
    if (!method)        throw new MissingParam("method");
    if (!path)          throw new MissingParam("path");
    if (nameRaw === null) throw new MissingParam("name");

    const name = nameRaw === "" ? null : nameRaw;
    await cms.repository.setActiveMockup(providerId, method, path, name);
    return new Response();
}
