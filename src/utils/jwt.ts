import jwt, { type SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import nacl from "tweetnacl";

const getSecret = (): string => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("JWT_SECRET is required in production");
        }
        return "dev-only-jwt-secret-change-me";
    }
    return secret;
};

export type AccessTokenPayload = {
    sub: string;
    username: string;
    walletAddress: string;
};

export function signAccessToken(params: { userId: string; username: string; walletAddress: string }): string {
    const signOptions: SignOptions = {
        subject: params.userId,
        expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"],
    };

    return jwt.sign(
        { username: params.username, walletAddress: params.walletAddress },
        getSecret(),
        signOptions
    );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
    const decoded = jwt.verify(token, getSecret()) as jwt.JwtPayload & {
        username?: string;
        walletAddress?: string;
    };

    const sub = decoded.sub;
    if (!sub || typeof decoded.username !== "string" || typeof decoded.walletAddress !== "string") {
        throw new Error("Invalid token payload");
    }

    return {
        sub,
        username: decoded.username,
        walletAddress: decoded.walletAddress,
    };
}

