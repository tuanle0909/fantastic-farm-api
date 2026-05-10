import "./loadEnv";
import express from "express";
import session from 'express-session'
import appRouter from "./routes/appRoutes";
import { errorHandler } from "./middlewares/errorHandler";
// import passport from './config/passport'
import cors from "cors"
import cookieParser from "cookie-parser";

const app = express();

// Middleware, route sẽ khai báo ở đây sau
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const corsOptions = {
    origin: function (origin: any, callback: any) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (!allowedOrigins.includes(origin)) {
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Specify allowed methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Specify allowed headers
    credentials: true // If you need to handle cookies or sessions
}

app.use(cors(corsOptions));
app.use(cookieParser()); 
// app.use(passport.initialize())
app.use(express.json())
app.use('/api', appRouter)
app.use(errorHandler)
export default app;
