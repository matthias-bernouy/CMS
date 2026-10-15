import { MUTATION_REDIRECT_ATTR, MUTATION_REDIRECT_PARAM_ATTR, MUTATION_RESET_ATTR } from "../../core/attrs";
import { interpolateString, type FilterMap } from "../../core/interpolate";
import type { Scope } from "../../core/scope";
import type { FormSubmitResult } from "../../form/formSubmit";

export class MutationCompletion {
    constructor(
        private readonly element: Element,
        private readonly filters: FilterMap,
    ) {}

    complete(result: FormSubmitResult, alias: string): void {
        if (!result.ok) {
            return;
        }
        if (this.shouldReset()) {
            result.form.reset();
        }
        const target = this.successRedirect(result, alias);
        if (target) {
            this.redirect(target);
        }
    }

    private shouldReset(): boolean {
        const value = this.element.getAttribute(MUTATION_RESET_ATTR)?.trim().toLowerCase();
        return value !== "false";
    }

    private successRedirect(result: FormSubmitResult, alias: string): string {
        const param = this.element.getAttribute(MUTATION_REDIRECT_PARAM_ATTR)?.trim();
        const requested = param ? new URLSearchParams(location.search).get(param)?.trim() : "";
        if (requested && this.redirectUrl(requested)) {
            return requested;
        }
        const template = this.element.getAttribute(MUTATION_REDIRECT_ATTR)?.trim();
        if (!template) {
            return "";
        }
        const scope: Scope = {
            value: result,
            vars: {
                [alias]: {
                    activity: "idle",
                    hasData: true,
                    data: result.body,
                    outcome: result.outcome ?? { kind: "success", status: result.status },
                },
                result,
            },
        };
        return interpolateString(template, scope, this.filters).trim();
    }

    private redirect(target: string): void {
        const url = this.redirectUrl(target);
        if (url) {
            location.href = `${url.pathname}${url.search}${url.hash}`;
        }
    }

    private redirectUrl(target: string): URL | null {
        let url: URL;
        try {
            url = new URL(target, location.href);
        } catch {
            return null;
        }
        return url.origin === location.origin && (url.protocol === "http:" || url.protocol === "https:") ? url : null;
    }
}
