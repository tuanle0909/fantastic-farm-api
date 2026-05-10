import mongoose from "mongoose";

const connectDB = async() => {
    try {
        const url = process.env.MONGODB_URL as string
        await mongoose.connect(url)
        console.log("Connected db!")
    } catch (err) {
        console.log(err)
        console.log("Faild to conncect db")
        process.exit(1)
    }
}

export default connectDB