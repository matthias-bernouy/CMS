import BubblesEvent from "src/control/core/dom/BubblesEvent";
import { buildRequestUrl } from "src/control/core/dom/buildRequestUrl";
import type CmsForm from "../Form";


export default function onSubmit(e: SubmitEvent, me: CmsForm){

    e.preventDefault();

    const form = e.target as HTMLFormElement;

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    fetch(buildRequestUrl(me.target), {
        method: me.method || "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }).then((res) => {
        if ( res.ok ){
            form.reset();
            me.dispatchEvent(new BubblesEvent("form:success"));
            if ( me.emit ) {
                document.dispatchEvent(new BubblesEvent(me.emit));
            }
        } else {
            me.dispatchEvent(new BubblesEvent("form:failed"))
        }
    })

}