export default function replaceBasePath(html: string, basePath: string){
    if ( basePath === "/" ){
        return html.replaceAll("{{BASE_PATH}}", "");
    } else {
        return html.replaceAll("{{BASE_PATH}}", basePath);
    }
}