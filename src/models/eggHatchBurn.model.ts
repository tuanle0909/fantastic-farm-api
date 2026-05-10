import mongoose, { Schema, Types } from "mongoose";

/** One successful `burn_egg_for_hatch` tx digest = one hatch (replay protection). */
const eggHatchBurnSchema = new Schema(
    {
        txDigest: { type: String, required: true, unique: true, index: true },
        userId: { type: Types.ObjectId, required: true, ref: "User", index: true },
    },
    { timestamps: true }
);

export const EggHatchBurn =
    mongoose.models.EggHatchBurn || mongoose.model("EggHatchBurn", eggHatchBurnSchema);
