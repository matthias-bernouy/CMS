import BubblesEvent from "cms-control/core/dom/BubblesEvent";
import { buildRequestUrl } from "cms-control/core/dom/buildRequestUrl";
import { showToast } from "@bernouy/components";
import type CmsForm from "../Form";


export default async function onSubmit(e: SubmitEvent, me: CmsForm){

    e.preventDefault();

    const form = e.target as HTMLFormElement;

    const formData = new FormData(form);
    const data = await serializeFormData(formData);

    fetch(buildRequestUrl(me.target), {
        method: me.method || "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }).then(async (res) => {
        if ( res.ok ){
            form.reset();
            me.dispatchEvent(new BubblesEvent("form:success"));
            if ( me.emit ) {
                document.dispatchEvent(new BubblesEvent(me.emit));
            }
        } else {
            // Surface the failure — a silent rejection (e.g. a validation 400) used to
            // look like "nothing happened". The API serializes thrown errors as
            // `{ error: message }` (see BunRunner).
            showToast(await readErrorMessage(res), { type: "error" });
            me.dispatchEvent(new BubblesEvent("form:failed"));
        }
    }).catch(() => {
        showToast("Network error — please try again.", { type: "error" });
        me.dispatchEvent(new BubblesEvent("form:failed"));
    });

}

async function serializeFormData(formData: FormData): Promise<Record<string, string>> {
    const data: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
        if (isFileEntry(value)) {
            if (!value.name && value.size === 0) continue;
            data[key] = await value.text();
            continue;
        }
        data[key] = value;
    }
    return data;
}

type FileEntry = { name: string; size: number; text: () => Promise<string> };
function isFileEntry(value: unknown): value is FileEntry {
    return typeof value === "object" && value !== null
        && typeof (value as FileEntry).name === "string"
        && typeof (value as FileEntry).size === "number"
        && typeof (value as FileEntry).text === "function";
}

async function readErrorMessage(res: Response): Promise<string> {
    try {
        const body = await res.json();
        if (body && typeof body.error === "string" && body.error) return body.error;
    } catch { /* response body wasn't JSON */ }
    return res.statusText || `Request failed (${res.status})`;
}
