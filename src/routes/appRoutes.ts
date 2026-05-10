import { Router } from "express";
import authRouter from "./authRoutes";
import gameRouter from "./gameRoutes";
import onchainRouter from "./onchainRoutes";

const appRouter = Router();

appRouter.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
});

appRouter.use("/auth", authRouter);
appRouter.use("/game", gameRouter);
appRouter.use("/onchain", onchainRouter);

export default appRouter;