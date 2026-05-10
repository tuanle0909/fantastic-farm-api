import mongoose from "mongoose";
import animalSchema from "./animal.model";
import itemSchema from "./item.model";
import userSchema from "./user.model";

export const User = mongoose.models.User || mongoose.model("User", userSchema);
export const Animal = mongoose.models.Animal || mongoose.model("Animal", animalSchema);
export const Item = mongoose.models.Item || mongoose.model("Item", itemSchema);
export { EggHatchBurn } from "./eggHatchBurn.model";
export { FarmProductMintTx } from "./farmProductMintTx.model";
export {
    FarmProductMintProofReservation,
    RESERVATION_TTL_MS,
} from "./farmProductMintProofReservation.model";
