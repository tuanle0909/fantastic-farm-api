import { Router } from "express";
import {
    finalizeFarmProductMintController,
    mintFarmProductProofController,
    mintSignerPublicKeyController,
} from "../controllers/onchain.controller";
import { authRequired } from "../middlewares/authRequired";

const onchainRouter = Router();

onchainRouter.get("/mint-signer-pubkey", mintSignerPublicKeyController);
onchainRouter.post("/mint-farm-product-proof", authRequired, mintFarmProductProofController);
onchainRouter.post("/finalize-farm-product-mint", authRequired, finalizeFarmProductMintController);

export default onchainRouter;
