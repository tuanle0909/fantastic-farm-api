import { NextFunction, Request, Response } from "express";
import type { AuthedRequest } from "../types/authRequest";
import { ApiError } from "../utils/apiError";
import { verifyAccessToken } from "../utils/jwt";

export function authRequired(req: Request, _res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return next(new ApiError(401, "Missing or invalid Authorization header"));
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
        return next(new ApiError(401, "Missing access token"));
    }

    try {
        (req as AuthedRequest).auth = verifyAccessToken(token);
        next();
    } catch {
        next(new ApiError(401, "Invalid or expired access token"));
    }
}
