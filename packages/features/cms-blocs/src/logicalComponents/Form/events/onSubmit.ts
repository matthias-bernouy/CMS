import type { Form } from "../Form";
import { buildRequestUrl } from "../../../base/buildRequestUrl";


export default async function onSubmit(e: SubmitEvent, me: Form) {

    e.preventDefault();

    const form = e.target as HTMLFormElement;

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    const res = await fetch(buildRequestUrl(me.target), {
        method: me.method || "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    });

    const body = await res.json().catch(() => null);
    const detail = { status: res.status, body };

    if (res.ok) {
        form.reset();
        me.dispatchEvent(new CustomEvent("form:success", { bubbles: true, composed: true, detail }));
        if (me.emit) {
            document.dispatchEvent(new CustomEvent(me.emit, { bubbles: true, composed: true, detail }));
        }
        if (me.redirect) {
            window.location.href = me.redirect;
        }
    } else {
        me.dispatchEvent(new CustomEvent("form:failed", { bubbles: true, composed: true, detail }));
    }
}
