import mongoose, { Schema, Types } from "mongoose";

/** One successful registry mint digest = finalize once (replay + idempotent). */
const farmProductMintTxSchema = new Schema(
    {
        txDigest: { type: String, required: true, unique: true, index: true },
        userId: { type: Types.ObjectId, required: true, ref: "User", index: true },
        pendingMintId: { type: String, required: true },
    },
    { timestamps: true },
);

export const FarmProductMintTx =
    mongoose.models.FarmProductMintTx || mongoose.model("FarmProductMintTx", farmProductMintTxSchema);
