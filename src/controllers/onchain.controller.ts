import { NextFunction, Request, Response } from "express";
import { getMintSignerPublicKeyHex } from "../config/fantasticFarmEnv";
import type { AuthedRequest } from "../types/authRequest";
import { ApiError } from "../utils/apiError";
import {
    finalizeFarmProductMintFromTx,
    issueFarmProductMintProofWithReservation,
} from "../services/farm.service";
import { getGameLoadData } from "../services/game.service";

/** Public: hex pubkey for pasting into Move `farm_config::server_public_key`. */
export const mintSignerPublicKeyController = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const hex = await getMintSignerPublicKeyHex();
        res.status(200).json({
            status: "success",
            data: { publicKeyHex64: hex },
        });
    } catch (error) {
        if (error instanceof Error && error.message.includes("Missing FANTASTIC_FARM_MINT")) {
            next(new ApiError(503, "Mint signing key not configured"));
            return;
        }
        next(error);
    }
};

/** One open proof reservation per pending drop (anti-spam mints). Pending row removed only after finalize. */
export const mintFarmProductProofController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { auth } = req as AuthedRequest;
        const userId = auth.sub;
        const wallet = auth.walletAddress?.trim() ?? "";
        if (!wallet) {
            throw new ApiError(400, "Wallet address missing from session");
        }
        const pendingMintId = String((req.body as { pendingMintId?: string })?.pendingMintId ?? "").trim();
        if (!pendingMintId) {
            throw new ApiError(400, "pendingMintId required");
        }
        const data = await issueFarmProductMintProofWithReservation(userId, wallet, pendingMintId);
        res.status(200).json({ status: "success", data });
    } catch (error) {
        next(error);
    }
};

export const finalizeFarmProductMintController = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const { auth } = req as AuthedRequest;
        const txDigest = String((req.body as { txDigest?: string })?.txDigest ?? "").trim();
        const pendingMintId = String((req.body as { pendingMintId?: string })?.pendingMintId ?? "").trim();
        if (!txDigest || !pendingMintId) throw new ApiError(400, "txDigest and pendingMintId required");
        await finalizeFarmProductMintFromTx(auth.sub, auth.walletAddress ?? "", txDigest, pendingMintId);
        const data = await getGameLoadData(auth.sub);
        res.status(200).json({ status: "success", data });
    } catch (error) {
        next(error);
    }
};
