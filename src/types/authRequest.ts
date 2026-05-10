import type { Request } from "express";
import type { AccessTokenPayload } from "../utils/jwt";

/** Use after `authRequired` middleware. */
export type AuthedRequest = Request & { auth: AccessTokenPayload };
