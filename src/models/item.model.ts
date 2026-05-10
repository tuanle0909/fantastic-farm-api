import { Schema } from "mongoose";

const itemSchema = new Schema(
    {
        itemKey: { type: String, required: true, unique: true, trim: true },
        name: { type: String, required: true, trim: true },
        description: { type: String, default: "" },
        kind: { type: String, enum: ["off", "on", "egg", "feed"], default: "off" },
        sellGold: { type: Number, default: 0 },
        fcValue: { type: Number, default: 0 },
        tierId: { type: String, default: null, trim: true },
    },
    { timestamps: true }
);

export default itemSchema;
