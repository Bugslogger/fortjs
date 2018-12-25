import * as http from "http";
import * as url from 'url';
import { Controller } from "../abstracts/controller";
import { __ContentType, __AppName, __Cookie, __SetCookie } from "../constant";
import { Global } from "../global";
import { parseCookie } from "../helpers/parse_cookie";
import { CookieManager } from "../model/cookie_manager";
import { GenericSessionProvider } from "../model/generic_session_provider";
import { GenericGuard } from "../model/generic_guard";
import { parseAndMatchRoute } from "../helpers/parse_match_route";
import { IRouteMatch } from "../interfaces/route_match";
import { HTTP_METHOD } from "../enums/http_method";
import { HttpResult } from "../types";
import { PostHandler } from "./post_handler";
import { HttpRequest } from "../types/http_request";
import { HttpResponse } from "../types/http_response";

export class RequestHandler extends PostHandler {

    private session_: GenericSessionProvider;
    private query_: any;
    private data_ = {};
    private routeMatchInfo_: IRouteMatch;


    constructor(request: http.IncomingMessage, response: http.ServerResponse) {
        super();
        this.request = request;
        this.response = response;
        this.registerEvents_();
    }

    private registerEvents_() {
        this.request.on('error', this.onBadRequest);
        this.response.on('error', this.onErrorOccured.bind(this));
    }

    private runWallIncoming_() {
        return Promise.all(Global.walls.map(async (wall) => {
            const wallObj = new wall();
            wallObj.cookie = this.cookieManager;
            wallObj.session = this.session_;
            wallObj.request = this.request as HttpRequest;
            wallObj.response = this.response as HttpResponse;
            wallObj.data = this.data_;
            wallObj.query = this.query_;
            this.wallInstances.push(wallObj);
            return await wallObj.onIncoming();
        }));
    }

    private runController_() {
        const controllerObj: Controller = new this.routeMatchInfo_.controller();
        controllerObj.request = this.request as HttpRequest;
        controllerObj.response = this.response;
        controllerObj.query = this.query_;
        controllerObj.body = this.body;
        controllerObj.session = this.session_;
        controllerObj.cookie = this.cookieManager;
        controllerObj.params = this.routeMatchInfo_.params;
        controllerObj.data = this.data_;
        controllerObj.file = this.file;
        controllerObj[this.routeMatchInfo_.actionInfo.workerName]().then(
            this.onResultEvaluated.bind(this)
        ).catch(this.onErrorOccured.bind(this));
    }

    private executeShieldsProtection_() {
        return Promise.all(this.routeMatchInfo_.shields.map(async shield => {
            const shieldObj = new shield();
            shieldObj.cookie = this.cookieManager;
            shieldObj.query = this.query_;
            shieldObj.session = this.session_;
            shieldObj.request = this.request as HttpRequest;
            shieldObj.response = this.response as HttpResponse;
            shieldObj.data = this.data_;
            return await shieldObj.protect();
        }));
    }

    private executeGuardsCheck_(guards: Array<typeof GenericGuard>) {
        return Promise.all(guards.map(async guard => {
            const guardObj = new guard();
            guardObj.body = this.body;
            guardObj.cookie = this.cookieManager;
            guardObj.query = this.query_;
            guardObj.session = this.session_;
            guardObj.request = this.request as HttpRequest;
            guardObj.response = this.response as HttpResponse;
            guardObj.data = this.data_;
            guardObj.file = this.file;
            guardObj.params = this.routeMatchInfo_.params;
            return await guardObj.check();
        }));
    }

    private parseCookieFromRequest_() {
        if (Global.shouldParseCookie === true) {
            const rawCookie = (this.request.headers[__Cookie] || this.request.headers["cookie"]) as string;
            const parsedCookies = parseCookie(rawCookie);
            this.session_ = new Global.sessionProvider();
            this.cookieManager = new CookieManager(parsedCookies);
            this.session_.sessionId = parsedCookies[Global.appSessionIdentifier];
            this.session_.cookie = this.cookieManager;
        }
    }

    private setPreHeader_() {
        this.response.setHeader('X-Powered-By', Global.appName);
        this.response.setHeader('Vary', 'Accept-Encoding');
        this.response.sendDate = true;
    }

    private async execute_() {
        try {
            const urlDetail = url.parse(this.request.url, true);
            this.query_ = urlDetail.query;
            this.parseCookieFromRequest_();
            const wallProtectionResult = await this.runWallIncoming_();
            const responseByWall: HttpResult = wallProtectionResult.find(qry => qry != null);
            if (responseByWall == null) {
                const pathUrl = urlDetail.pathname;
                const requestMethod = this.request.method as HTTP_METHOD;
                this.routeMatchInfo_ = parseAndMatchRoute(pathUrl.toLowerCase(), requestMethod);
                if (this.routeMatchInfo_ == null) { // no route matched
                    // it may be a file or folder then
                    this.handleFileRequest(pathUrl);
                }
                else {
                    const actionInfo = this.routeMatchInfo_.actionInfo;
                    if (actionInfo == null) {
                        this.onMethodNotAllowed(this.routeMatchInfo_.allows);
                    }
                    else {
                        const shieldProtectionResult = await this.executeShieldsProtection_();
                        const responseByShield = shieldProtectionResult.find(qry => qry != null);
                        if (responseByShield == null) {
                            await this.handlePostData();
                            const guardsCheckResult = await this.executeGuardsCheck_(actionInfo.guards);
                            const responseByGuard = guardsCheckResult.find(qry => qry != null);
                            if (responseByGuard == null) {
                                this.runController_();
                            }
                            else {
                                this.onResultEvaluated(responseByGuard);
                            }
                        }
                        else {
                            this.onResultEvaluated(responseByShield);
                        }
                    }
                }
            }
            else {
                this.onResultEvaluated(responseByWall);
            }
        }
        catch (ex) {
            this.onErrorOccured(ex);
        }
    }

    async handlePostData() {
        if (this.request.method === HTTP_METHOD.Get) {
            this.body = {};
        }
        else if (Global.shouldParsePost === true) {
            try {
                const body = await this.parsePostData();
                this.body = body;
            }
            catch (ex) {
                this.onBadRequest(ex);
            }
        }
    }

    async handle() {
        this.setPreHeader_();
        this.execute_();
    }
}