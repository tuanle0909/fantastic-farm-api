import mongoose, { Schema, Types } from "mongoose";

/** After this, another `/mint-farm-product-proof` is allowed if pending still exists (BE-only; was 6m). */
export const RESERVATION_TTL_MS = 60_000;

/** Tracks one in-flight mint proof per pending drop so users cannot spam new proofs/nonces without consuming the drop. */
const farmProductMintProofReservationSchema = new Schema(
    {
        userId: { type: Types.ObjectId, required: true, ref: "User", index: true },
        pendingMintId: { type: String, required: true, trim: true, index: true },
        /** Nonce serialized as decimal string — must match on-chain `FarmProductMinted` for finalize. */
        expectedNonce: { type: String, required: true, trim: true },
        expiresAt: { type: Date, required: true, index: true },
    },
    { timestamps: true },
);

farmProductMintProofReservationSchema.index({ userId: 1, pendingMintId: 1 }, { unique: true });

export const FarmProductMintProofReservation =
    mongoose.models.FarmProductMintProofReservation ||
    mongoose.model("FarmProductMintProofReservation", farmProductMintProofReservationSchema);
