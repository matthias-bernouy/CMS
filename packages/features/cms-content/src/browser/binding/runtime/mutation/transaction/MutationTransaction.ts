import { SOURCE_SERIALIZATION_ATTR } from "../../../core/attrs";
import type { FormSubmitResult } from "../../../form/types";
import { formMutationReload } from "../../query/mutationRefresh";
import type { MutationRequest } from "../MutationRequest";
import { lockEditing } from "./editingLock";

type Captured = NonNullable<ReturnType<MutationRequest["capture"]>>;

/** One captured submission, its optional edit lock and its awaited read. */
export class MutationTransaction {
    private constructor(
        private readonly request: MutationRequest,
        private readonly captured: Captured,
        private readonly reload: ReturnType<typeof formMutationReload>,
        private unlock: (() => void) | null,
    ) {}

    static prepare(element: Element, request: MutationRequest, url: string): MutationTransaction | null {
        const reload = formMutationReload(element as HTMLFormElement);
        const captured = request.capture(url);
        if (!captured) {
            return null;
        }
        const needsLock = reload || element.getAttribute(SOURCE_SERIALIZATION_ATTR) === "typed-json";
        const unlock = needsLock ? lockEditing(reload?.source ?? element, captured.form) : null;
        if (needsLock && !unlock) {
            return null;
        }
        return new MutationTransaction(request, captured, reload, unlock);
    }

    get locked(): boolean {
        return this.unlock !== null;
    }

    async send(url: string, signal: AbortSignal): Promise<FormSubmitResult | null> {
        const result = await this.request.send(this.captured, url, signal);
        if (signal.aborted || (this.reload && !this.reload.current())) {
            return null;
        }
        if (result.ok && this.reload) {
            const ok = await this.reload.reload();
            if (signal.aborted || !this.reload.current()) {
                return null;
            }
            result.refresh = {
                ok,
                message: ok ? "" : "Saved, but refreshing the data failed. Reload the source without submitting again.",
            };
        }
        return result;
    }

    release(): void {
        const unlock = this.unlock;
        this.unlock = null;
        unlock?.();
    }
}
