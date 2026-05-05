
export function getMetaBasePath(){
    const meta = document.querySelector('meta[name="basePath"]');
    if (!meta) return "/";
    if ( meta && (meta.getAttribute('content') === "" || meta.getAttribute('content') === undefined) ) return "/";
    else return meta.getAttribute('content');
}