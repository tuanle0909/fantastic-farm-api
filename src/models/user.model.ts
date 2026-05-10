import { Schema, Types } from "mongoose";

const userSchema = new Schema(
    {
        username: { type: String, required: true, unique: true },
        walletAddress: { type: String, unique: true, sparse: true, index: true, trim: true },
        authProvider: { type: String, default: "sui" },
        lastLoginAt: { type: Date },
        gold: { type: Number, default: 0 },
        /** Off-chain FC ledger for demo until wallet balances are wired. */
        fcBalance: { type: Number, default: 0 },
        exp: { type: Number, default: 0 },
        starterBonusUntil: { type: Date, default: null },
        inventory: [
            {
                itemId: { type: Types.ObjectId, ref: "Item", required: true },
                quantity: { type: Number, default: 1, required: true, min: 1 },
            },
        ],
        /** GDD §5.2: rare on-chain drops queued until player mints `FarmProductNft` on Sui. */
        pendingFarmProductMints: [
            {
                species: { type: String, required: true },
                tierId: { type: String, required: true },
                createdAt: { type: Date, default: Date.now },
            },
        ],
        /** Off-chain spawn products (FIFO) — collected via POST /inventory/collect; share cap with pendingFarmProductMints. */
        pendingOffChainFarmDrops: [
            {
                itemKey: { type: String, required: true },
                quantity: { type: Number, required: true, min: 1 },
                queuedAt: { type: Date, default: Date.now },
            },
        ],
        stamina: { type: Number, default: 100 },
    },
    { timestamps: true }
);

export default userSchema;
