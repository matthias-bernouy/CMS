import { join, resolve } from "node:path";
import type { ResourceInitializationOptions } from "@bernouy/resources/initialization";
import { captureResourceBytes } from "./binary";

/** Image-owned base files only: no remote discovery, URL, release catalogue or installed ZIP identity. */
export function bundledResourceSource(
    profileId: string,
    root = resolve(import.meta.dir, "../../../../dist/bootstrap/resources"),
): ResourceInitializationOptions["source"] {
    if (!["ulvia", "repository"].includes(profileId)) {
        throw new TypeError("Unsupported base resource profile");
    }
    return async (locale, signal) => {
        signal.throwIfAborted();
        if (locale.length > 64 || !/^[a-zA-Z0-9-]+$/u.test(locale) || Intl.getCanonicalLocales(locale)[0] !== locale) {
            throw new TypeError("Invalid resource locale");
        }
        for (const language of new Set([locale, locale.split("-")[0]!, "en"])) {
            const path = join(root, profileId, language + ".zip");
            const bytes = Bun.file(path);
            if (!(await bytes.exists())) {
                continue;
            }
            const expected = new TextDecoder("utf-8", { fatal: true })
                .decode(await captureResourceBytes(Bun.file(path + ".sha256"), signal, undefined, 72))
                .trim();
            if (!/^sha256:[a-f0-9]{64}$/u.test(expected)) {
                throw new TypeError("Invalid bundled resource digest");
            }
            signal.throwIfAborted();
            return { digest: expected, bytes };
        }
        return null;
    };
}
