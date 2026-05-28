import { Component } from "@bernouy/cms-control/component";
import { Editor, registerEditor, registerEditor_opaque } from "@bernouy/cms-control/editor";
import { P9R_ATTR } from "@bernouy/cms-shared/constants";
import { showToast } from "../core/showToast";


(window as any).p9r = {
    attr: P9R_ATTR,
    Component,
    Editor,
    registerEditor,
    registerEditor_opaque
}



// document.addEventListener("fetch:loading", (e) => {
//     showToast("Data loading " + e, {
//         type: "info"
//     })
// })

// document.addEventListener("fetch:data", (e) => {
//     console.log("fetch end")
// })

// document.addEventListener("fetch:error", (e) => {
//     showToast("Error during data get " + e, {
//         type: "error"
//     })
// })

// document.addEventListener("form:success", (e) => {
//     showToast("Form success " + e, {
//         type: "info"
//     })
// })

// document.addEventListener("form:error", (e) => {
//     showToast("Form Error " + e, {
//         type: "error"
//     })
// })