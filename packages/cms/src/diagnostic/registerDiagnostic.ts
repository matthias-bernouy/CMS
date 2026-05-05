import type { Runner } from "@bernouy/socle";
import type { HeadInjector } from "src/delivery/interfaces/HeadInjector";
import { buildDiagnosticScript } from "src/diagnostic/buildDiagnosticScript";

const SCRIPT_PATH = "/.diag/agent.js";
const META_NAME   = "p9r-diag-tags";

/**
 * Wire the opt-in diagnostic agent onto a runner and return a
 * `HeadInjector` to register on the paired Delivery.
 *
 * Two side-effects:
 *   1. `GET <runner.basePath>/.diag/agent.js` is registered on `runner`,
 *      serving the compiled agent IIFE (memoized in module scope).
 *   2. The returned injector appends a `<meta name="p9r-diag-tags">` and a
 *      parser-blocking `<script src="...">` to the rendered page's
 *      `<head>`. Parser-blocking + top-of-head means the agent runs
 *      *before* any deferred bloc IIFE registers its tag — that ordering
 *      is required for the `customElements.define` monkeypatch to capture
 *      every registration.
 *
 * The agent itself early-returns when the URL has no `?p9r-diag=1`, so
 * the runtime cost on regular requests is one HTTP round-trip plus one
 * function call. Pass the injector as part of `DeliveryCmsConfig.headInjectors`:
 *
 *   const diagInjector = registerDiagnostic(runner);
 *   const delivery     = new DeliveryCms({ runner, ..., headInjectors: [diagInjector] });
 *
 * Multi-tenant: scope the runner first, register diagnostic on the same
 * scoped runner Delivery uses — the script path resolves through the
 * tenant's basePath automatically.
 */
export function registerDiagnostic(runner: Runner): HeadInjector {
    runner.addEndpoint("GET", SCRIPT_PATH, async () => {
        const code = await buildDiagnosticScript();
        return new Response(code, {
            headers: {
                "Content-Type":  "application/javascript; charset=utf-8",
                "Cache-Control": "no-cache",
            },
        });
    });

    const basePath = runner.basePath === "/" ? "" : runner.basePath;
    const scriptSrc = `${basePath}${SCRIPT_PATH}`;

    return ({ document, head, usedTags }) => {
        const meta = document.createElement("meta");
        meta.setAttribute("name",    META_NAME);
        meta.setAttribute("content", JSON.stringify(usedTags));
        head.appendChild(meta);

        const script = document.createElement("script");
        script.setAttribute("src", scriptSrc);
        head.appendChild(script);
    };
}
