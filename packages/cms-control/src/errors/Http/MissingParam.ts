

export default class MissingParam extends Error{

    /** Client error — the runner maps this to a 400 response. */
    status = 400;

    constructor(name: string){
        super("Missing param " + name);
    }

}