import { Router } from "express";
import {
    buyFeedController,
    collectItemController,
    convertItemController,
    feedAnimalController,
    gameConfigController,
    hatchEggController,
    hatchEggOnChainController,
    loadGameDataController,
    preflightEggNftHatchOnChainController,
    sellItemController,
    syncFarmController,
    verifyHashController,
} from "../controllers/game.controller";
import { authRequired } from "../middlewares/authRequired";

const gameRouter = Router();

gameRouter.get("/config", gameConfigController);
gameRouter.get("/load", authRequired, loadGameDataController);
gameRouter.post("/sync", authRequired, syncFarmController);
gameRouter.post("/inventory/collect", authRequired, collectItemController);
gameRouter.post("/feed", authRequired, feedAnimalController);
gameRouter.post("/shop/buy", authRequired, buyFeedController);
gameRouter.post("/sell", authRequired, sellItemController);
gameRouter.post("/hatch", authRequired, hatchEggController);
gameRouter.post("/hatch-onchain", authRequired, hatchEggOnChainController);
gameRouter.post("/hatch-onchain/preflight", authRequired, preflightEggNftHatchOnChainController);
gameRouter.post("/convert", authRequired, convertItemController);
gameRouter.post("/verify-hash", authRequired, verifyHashController);

export default gameRouter;
