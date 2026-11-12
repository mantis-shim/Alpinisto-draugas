import mongoose from 'mongoose';
import { MONGODB_URI } from '$app/env/private';

/** Opens the MongoDB connection once per server process. Called from the `init` hook. */
export async function connectDb() {
	if (mongoose.connection.readyState !== 0) return; // already connected or connecting (dev reloads)
	await mongoose.connect(MONGODB_URI);
}
