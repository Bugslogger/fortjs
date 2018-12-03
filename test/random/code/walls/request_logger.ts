import { Wall } from "fortjs";
let reqCount = 0;
export class RequestLogger extends Wall {

    private getIP(req) {
        var ip = (req.headers['x-forwarded-for'] || '').split(',').pop() ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            req.connection.socket.remoteAddress
        return ip;
    }
    async onIncoming() {
        // const log = {
        //     url: this.request.url,
        //     body: this.body
        // }
        // console.log(log);
        this.data.ip = this.getIP(this.request);
        this.data.reqCount = ++reqCount;
        console.log("reqcount", this.data.reqCount);
        return null;
    }
}