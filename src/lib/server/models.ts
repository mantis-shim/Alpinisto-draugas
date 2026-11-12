// The whole data model (CLAUDE.md "Data model"). No foreign keys: documents link by userId.
// Collections: users, items, hikes, sessions (Mongoose pluralises the model names).
import mongoose, { Schema } from 'mongoose';
import {
	FITNESS_LEVELS,
	HIKE_DIFFICULTIES,
	ITEM_CATEGORIES,
	ITEM_PRIORITIES,
	SEASONS,
	TEMPERATURES
} from '#lib/domain.ts';

const { ObjectId } = Schema.Types;
// Vite re-runs this module on every edit in dev; replace models instead of throwing OverwriteModelError.
const compile = { overwriteModels: true };

// users ---------------------------------------------------------------------------

const fitnessAssessmentSchema = new Schema(
	{
		averageDailySteps: { type: Number, required: true, min: 0 },
		hikesLast3Years: { type: Number, required: true, min: 0 },
		level: { type: String, enum: FITNESS_LEVELS, required: true },
		completedDate: { type: Date, required: true }
	},
	{ _id: false }
);

const consentSchema = new Schema(
	{
		version: { type: String, required: true }, // PRIVACY_POLICY_VERSION the user accepted
		givenAt: { type: Date, required: true },
		withdrawn: { type: Boolean, default: false },
		withdrawnAt: Date
	},
	{ _id: false }
);

const userSchema = new Schema(
	{
		email: { type: String, required: true, unique: true, lowercase: true, trim: true },
		passwordHash: { type: String, required: true }, // see password.ts, never the plain password
		fitnessAssessment: fitnessAssessmentSchema, // absent until the questionnaire is filled (UC-5)
		consents: [consentSchema]
	},
	{ timestamps: true }
);

export const User = mongoose.model('User', userSchema, undefined, compile);

// items (the user's inventory) ----------------------------------------------------

const attributeSchema = new Schema(
	{
		name: { type: String, required: true, trim: true }, // e.g. "spalva", "neperšlampamas"
		value: { type: String, default: '', trim: true } // empty for tag-like attributes
	},
	{ _id: false }
);

const itemSchema = new Schema({
	userId: { type: ObjectId, required: true },
	name: { type: String, required: true, trim: true },
	category: { type: String, enum: ITEM_CATEGORIES, required: true },
	suitability: [{ type: String, enum: TEMPERATURES }],
	attributes: [attributeSchema]
});
itemSchema.index({ userId: 1, name: 1 }); // inventory sorted by name, duplicate-name check

export const Item = mongoose.model('Item', itemSchema, undefined, compile);

// hikes (trip details + generated plan = trip history) ---------------------------

const recommendedItemSchema = new Schema({
	// keeps its _id so a single item can be marked "Įsigyta"
	name: { type: String, required: true },
	category: { type: String, enum: ITEM_CATEGORIES, required: true },
	explanation: { type: String, required: true },
	owned: { type: Boolean, required: true }, // true: "Pasiimti iš inventoriaus", false: "Reikia įsigyti"
	inventoryItemId: ObjectId, // set when owned
	priority: { type: String, enum: ITEM_PRIORITIES }, // missing items only
	purchased: { type: Boolean, default: false } // marking it bought also adds it to the inventory
});

const recommendationsSchema = new Schema(
	{
		difficulty: { type: String, enum: HIKE_DIFFICULTIES, required: true },
		feasibility: { type: String, required: true }, // can the route be done in the available time
		fitnessComparison: { type: String, required: true }, // difficulty vs the user's fitness level
		weather: { type: String, required: true }, // LLM estimate, no weather API
		clothing: { type: String, required: true },
		locationDescription: String, // omitted when there is no reliable information about the place
		generatedAt: { type: Date, required: true },
		items: [recommendedItemSchema]
	},
	{ _id: false }
);

const aiRequestSchema = new Schema(
	{
		createdAt: { type: Date, required: true },
		sentContent: { type: String, required: true }, // exactly what was sent to the LLM
		usedItemIds: [ObjectId]
	},
	{ _id: false }
);

const hikePlanSchema = new Schema(
	{
		request: { type: aiRequestSchema, required: true },
		recommendations: { type: recommendationsSchema, required: true }
	},
	{ _id: false }
);

const hikeSchema = new Schema(
	{
		userId: { type: ObjectId, required: true },
		location: { type: String, required: true, trim: true },
		departureDate: { type: Date, required: true }, // calendar date, stored as UTC midnight
		returnDate: { type: Date, required: true },
		season: { type: String, enum: SEASONS, required: true },
		plan: hikePlanSchema // absent until recommendations are generated; stored as generated, never regenerated
	},
	{ timestamps: true }
);
hikeSchema.index({ userId: 1, createdAt: -1 }); // trip history, newest first

export const Hike = mongoose.model('Hike', hikeSchema, undefined, compile);

// sessions (login) -----------------------------------------------------------------

const sessionSchema = new Schema({
	_id: { type: String }, // SHA-256 of the cookie token; the raw token is never stored
	userId: { type: ObjectId, required: true, index: true },
	expiresAt: { type: Date, required: true, expires: 0 } // TTL index: MongoDB deletes expired sessions itself
});

export const Session = mongoose.model('Session', sessionSchema, undefined, compile);
