import { Schema, Types } from "mongoose";

const animalSchema = new Schema(
    {
        displayName: { type: String, required: true },
        /** 0–100 fullness (well-fed); aligns with GDD spawn brackets as satiety/100. */
        satiety: { type: Number, required: true, default: 100, min: 0, max: 100 },
        lastFed: { type: Date, required: true, default: Date.now },
        lastSatietyTickAt: { type: Date, required: true, default: Date.now },
        nextSpawnAt: { type: Date, required: true, default: Date.now },
        premiumFeedUntil: { type: Date, default: null },
        species: {
            type: String,
            required: true,
            enum: ["chicken", "goat", "sheep", "cow"],
        },
        isStarter: { type: Boolean, default: false },
        tier: { type: Number, default: 0 },
        suiNftId: { type: String, default: null, trim: true },
        ownerId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    },
    { timestamps: true }
);

export default animalSchema;
