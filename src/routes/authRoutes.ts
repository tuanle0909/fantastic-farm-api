import { Router } from "express";
import { meController, walletLoginController } from "../controllers/auth.controller";
import { authRequired } from "../middlewares/authRequired";

const authRouter = Router();

authRouter.post("/wallet-login", walletLoginController);
authRouter.get("/me", authRequired, meController);

export default authRouter;
