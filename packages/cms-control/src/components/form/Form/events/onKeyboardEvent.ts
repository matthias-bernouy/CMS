

export function onKeyboardEvent (e: KeyboardEvent, nativeForm: HTMLFormElement){
    if (e.key !== "Enter") return;
    
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA") return;
    
    e.preventDefault();
    
    nativeForm.requestSubmit();
};