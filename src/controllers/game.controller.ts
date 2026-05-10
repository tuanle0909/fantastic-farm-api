import { NextFunction, Request, Response } from "express";
import * as shared from "@fantastic-farm/shared";
import {
    buyFeed,
    convertOnChainItem,
    feedAnimal,
    finalizeHatchFromBurnedEggNftTx,
    hatchEgg,
    runEggNftHatchPrecheckDb,
    sellItem,
    verifyClientHash,
} from "../services/farm.service";
import { collectItemsForUser, getGameLoadData } from "../services/game.service";
import type { AuthedRequest } from "../types/authRequest";
import { isFastTestEnabled } from "../config/fastTest";
import { ApiError } from "../utils/apiError";

export const collectItemController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { auth } = req as AuthedRequest;
        const data = await collectItemsForUser(auth.sub, req.body);

        res.status(200).json({
            status: "success",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const loadGameDataController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { auth } = req as AuthedRequest;
        const data = await getGameLoadData(auth.sub);

        res.status(200).json({
            status: "success",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const gameConfigController = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        res.status(200).json({
            status: "success",
            data: {
                starterGold: shared.STARTER_GOLD,
                starterBonusDays: shared.STARTER_BONUS_DAYS,
                species: shared.SPECIES,
                levelExpThresholds: shared.LEVEL_EXP_THRESHOLDS,
                levelStorageSlots: shared.LEVEL_STORAGE_SLOTS,
                offchainSell: shared.OFFCHAIN_ITEM_SELL_GOLD,
                onChainTiers: shared.ON_CHAIN_TIERS,
                itemKeys: shared.ITEM_KEYS,
                /** BE `FANTASTIC_FARM_FAST_TEST` — spawn/hunger/shop overrides for local QA. */
                fastTest: isFastTestEnabled(),
            },
        });
    } catch (error) {
        next(error);
    }
};

export const syncFarmController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { auth } = req as AuthedRequest;
        const data = await getGameLoadData(auth.sub);
        res.status(200).json({ status: "success", data });
    } catch (error) {
        next(error);
    }
};

export const feedAnimalController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { auth } = req as AuthedRequest;
        const animalId = String((req.body as { animalId?: string })?.animalId ?? "");
        const premium = Boolean((req.body as { premium?: boolean })?.premium);
        if (!animalId) throw new ApiError(400, "animalId required");
        await feedAnimal({ userId: auth.sub, animalId, premium });
        const data = await getGameLoadData(auth.sub);
        res.status(200).json({ status: "success", data });
    } catch (error) {
        next(error);
    }
};

export const buyFeedController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { auth } = req as AuthedRequest;
        const itemKey = String((req.body as { itemKey?: string })?.itemKey ?? "");
        const quantity = Number((req.body as { quantity?: number })?.quantity ?? 1);
        if (!itemKey) throw new ApiError(400, "itemKey required");
        await buyFeed(auth.sub, itemKey, quantity);
        const data = await getGameLoadData(auth.sub);
        res.status(200).json({ status: "success", data });
    } catch (error) {
        next(error);
    }
};

export const sellItemController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { auth } = req as AuthedRequest;
        const itemKey = String((req.body as { itemKey?: string })?.itemKey ?? "");
        const quantity = Number((req.body as { quantity?: number })?.quantity ?? 1);
        if (!itemKey) throw new ApiError(400, "itemKey required");
        await sellItem(auth.sub, itemKey, quantity);
        const data = await getGameLoadData(auth.sub);
        res.status(200).json({ status: "success", data });
    } catch (error) {
        next(error);
    }
};

export const hatchEggController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { auth } = req as AuthedRequest;
        const eggItemKey = String((req.body as { eggItemKey?: string })?.eggItemKey ?? "");
        if (!eggItemKey) throw new ApiError(400, "eggItemKey required");
        await hatchEgg(auth.sub, eggItemKey);
        const data = await getGameLoadData(auth.sub);
        res.status(200).json({ status: "success", data });
    } catch (error) {
        next(error);
    }
};

export const hatchEggOnChainController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { auth } = req as AuthedRequest;
        const txDigest = String((req.body as { txDigest?: string })?.txDigest ?? "");
        if (!txDigest.trim()) throw new ApiError(400, "txDigest required");
        await finalizeHatchFromBurnedEggNftTx(auth.sub, auth.walletAddress, txDigest.trim());
        const data = await getGameLoadData(auth.sub);
        res.status(200).json({ status: "success", data });
    } catch (error) {
        next(error);
    }
};

export const preflightEggNftHatchOnChainController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { auth } = req as AuthedRequest;
        const speciesCode = Number((req.body as { speciesCode?: unknown })?.speciesCode);
        const data = await runEggNftHatchPrecheckDb(auth.sub, auth.walletAddress, speciesCode);
        res.status(200).json({ status: "success", data });
    } catch (error) {
        next(error);
    }
};

export const convertItemController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { auth } = req as AuthedRequest;
        const itemKey = String((req.body as { itemKey?: string })?.itemKey ?? "");
        const quantity = Number((req.body as { quantity?: number })?.quantity ?? 1);
        if (!itemKey) throw new ApiError(400, "itemKey required");
        await convertOnChainItem(auth.sub, itemKey, quantity);
        const data = await getGameLoadData(auth.sub);
        res.status(200).json({ status: "success", data });
    } catch (error) {
        next(error);
    }
};

export const verifyHashController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { auth } = req as AuthedRequest;
        const body = req.body as { hash?: string; timestamp?: number };
        await verifyClientHash(auth.sub, String(body.hash ?? ""), Number(body.timestamp));
        res.status(200).json({ status: "success", data: { ok: true } });
    } catch (error) {
        next(error);
    }
};
