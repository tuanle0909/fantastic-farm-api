import { STARTER_GOLD } from "@fantastic-farm/shared";
import { User } from "../models";
import { ApiError } from "../utils/apiError";
import { grantStarterPack } from "./farm.service";

const normalizeWalletAddress = (walletAddress: string) => walletAddress.trim().toLowerCase();

const buildUsernameFromWallet = (walletAddress: string) => `player_${walletAddress.slice(-6)}`;

export const loginWithWallet = async (walletAddress: string) => {
    const normalizedWalletAddress = normalizeWalletAddress(walletAddress);

    if (!normalizedWalletAddress) {
        throw new ApiError(400, "walletAddress is required");
    }

    let user = await User.findOne({ walletAddress: normalizedWalletAddress });
    let isNew = false;

    if (!user) {
        isNew = true;
        user = await User.create({
            username: buildUsernameFromWallet(normalizedWalletAddress),
            walletAddress: normalizedWalletAddress,
            authProvider: "sui",
            lastLoginAt: new Date(),
            gold: STARTER_GOLD,
            stamina: 100,
            inventory: [],
            exp: 0,
            fcBalance: 0,
        });
        await grantStarterPack(String(user._id));
    } else {
        user.lastLoginAt = new Date();
        await user.save();
    }

    return {
        userId: user._id,
        username: user.username,
        walletAddress: user.walletAddress,
        authProvider: user.authProvider,
        lastLoginAt: user.lastLoginAt,
        isNew,
    };
};
