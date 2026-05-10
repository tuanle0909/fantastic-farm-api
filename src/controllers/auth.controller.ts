import { levelFromExp, storageSlotsForLevel } from "@fantastic-farm/shared";
import { NextFunction, Request, Response } from "express";
import { User } from "../models";
import { loginWithWallet } from "../services/auth.service";
import type { AuthedRequest } from "../types/authRequest";
import { ApiError } from "../utils/apiError";
import { signAccessToken } from "../utils/jwt";

type WalletLoginBody = {
    walletAddress?: string;
    signature?: string;
    bytes?: string;
};

const SUI_RPC_URL = process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";
const SUI_NETWORK = (process.env.SUI_NETWORK ?? "testnet") as "mainnet" | "testnet" | "devnet" | "localnet";

export const walletLoginController = async (
    req: Request<unknown, unknown, WalletLoginBody>,
    res: Response,
    next: NextFunction
) => {
    try {
        const { walletAddress, signature, bytes } = req.body;

        if (!walletAddress || !signature || !bytes) {
            throw new ApiError(400, "walletAddress, signature, and bytes are required");
        }

        try {
            const { verifyPersonalMessageSignature } = await import("@mysten/sui/verify");
            const { SuiJsonRpcClient } = await import("@mysten/sui/jsonRpc");
            const suiClient = new SuiJsonRpcClient({ url: SUI_RPC_URL, network: SUI_NETWORK });

            const messageBytes = new Uint8Array(Buffer.from(bytes, "base64"));
            const publicKey = await verifyPersonalMessageSignature(messageBytes, signature, {
                client: suiClient,
            });
            const derivedAddress = publicKey.toSuiAddress();

            if (derivedAddress.toLowerCase() !== walletAddress.toLowerCase()) {
                throw new ApiError(401, "Signature verification failed: address mismatch");
            }
        } catch (err) {
            if (err instanceof ApiError) throw err;
            console.error("Signature verification error:", err);
            throw new ApiError(401, `Invalid signature: ${err instanceof Error ? err.message : String(err)}`);
        }

        const data = await loginWithWallet(walletAddress);
        const userId = String(data.userId);

        const accessToken = signAccessToken({
            userId,
            username: data.username,
            walletAddress: data.walletAddress,
        });

        res.status(200).json({
            status: "success",
            data: {
                ...data,
                userId,
                accessToken,
                isNew: data.isNew ?? false,
            },
        });
    } catch (error) {
        next(error);
    }
};

export const meController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { auth } = req as AuthedRequest;
        const user = await User.findById(auth.sub).lean();
        if (!user) {
            throw new ApiError(404, "User not found");
        }

        const exp = user.exp ?? 0;
        const level = levelFromExp(exp);

        res.status(200).json({
            status: "success",
            data: {
                userId: String(user._id),
                username: user.username,
                walletAddress: user.walletAddress,
                authProvider: user.authProvider,
                lastLoginAt: user.lastLoginAt,
                gold: user.gold,
                exp: user.exp,
                fcBalance: user.fcBalance,
                level,
                storageSlots: storageSlotsForLevel(level),
            },
        });
    } catch (error) {
        next(error);
    }
};
