

export default class BubblesEvent extends Event{
    constructor(type: string){
        super(type, {
            bubbles: true,
            composed: true
        })
    }
}