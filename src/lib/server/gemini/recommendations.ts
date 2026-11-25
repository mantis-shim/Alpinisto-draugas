// UC-7: generate recommendations for the user's open trip with Google Gemini and store them as the trip's `plan`.
// The only place that calls the external LLM (CLAUDE.md "Architecture"). The route passes in the env values.
import { ApiError, FinishReason, GoogleGenAI } from '@google/genai';
import { PRIVACY_POLICY_VERSION, type FitnessLevel } from '#lib/domain.ts';
import { listItems } from '#lib/server/inventory.ts';
import { Hike, User } from '#lib/server/models.ts';
import { seasonOf, tripDays } from '#lib/trip.ts';
import {
	InvalidAnswer,
	RECOMMENDATION_SCHEMA,
	SYSTEM_PROMPT,
	buildRequest,
	mockAnswer,
	parseRecommendations,
	type MockScenario
} from '#lib/server/gemini/recommendation-format.ts';

export const DEFAULT_MODEL = 'gemini-flash-latest'; // Google's alias for the newest Flash model
// Tried once when the main model is overloaded (503), times out (504), fails on Google's side (500) or is out of quota (429).
const FALLBACK_MODEL = 'gemini-flash-lite-latest';
const TIMEOUT_MS = 45_000; // per attempt
const RETRY_DELAYS_MS = [2_000]; // before the second attempt
const TOTAL_MS = 100_000; // no new attempt after this
const OVERLOADED = new Set([500, 502, 503, 504]);

/** `message` is Lithuanian and meant for the user; `retry` shows "Bandyti dar kartą". */
export class GenerationError extends Error {
	constructor(
		message: string,
		readonly retry: boolean,
		options?: ErrorOptions
	) {
		super(message, options);
	}
}

const NO_TRIP = 'Pirmiausia nurodyk kelionės vietą ir datas.';
const NO_CONSENT =
	'Rekomendacijoms reikia duomenų tvarkymo sutikimo. Be jo kelionės duomenų dirbtiniam intelektui nesiunčiame.';
const OFF = 'Rekomendacijų generavimas šiuo metu neįjungtas. Bandyk vėliau.';
const FAILED = 'Nepavyko sugeneruoti rekomendacijų. Bandyk dar kartą.';
const BUSY = 'Šiuo metu išnaudotas rekomendacijų užklausų limitas. Bandyk vėliau.';
const REFUSED = 'Dirbtinis intelektas negalėjo pateikti rekomendacijų šiai kelionei. Patikslink žygio vietą ir bandyk dar kartą.';

const openTrip = (userId: string) => ({ userId, plan: { $exists: false } });
const iso = (date: Date) => date.toISOString().slice(0, 10);

/** FR-8, FR-10: the user's latest consent is for the current policy and not withdrawn. */
const hasConsent = (consents: { version: string; withdrawn?: boolean | null }[] = []) => {
	const latest = consents.at(-1);
	return !!latest && latest.version === PRIVACY_POLICY_VERSION && !latest.withdrawn;
};

/** What the trip summary warns about before "Generuoti rekomendacijas" (UC-7 2a, 2b, FR-10). */
export async function generationNotes(userId: string) {
	const [user, inventory] = await Promise.all([
		User.findById(userId, 'consents fitnessAssessment.level').lean(),
		listItems(userId)
	]);
	return {
		consent: hasConsent(user?.consents),
		noQuestionnaire: !user?.fitnessAssessment,
		emptyInventory: inventory.length === 0
	};
}

export type LlmSettings = { apiKey?: string; model?: string; mock?: MockScenario };

/** Asks Gemini (or the mock) and returns its JSON text. */
async function askModel(settings: LlmSettings, user: string, mock: () => string): Promise<string> {
	if (settings.mock === 'ok') return mock();
	if (settings.mock === 'error') throw new GenerationError(FAILED, true);
	if (settings.mock === 'refusal') throw new GenerationError(REFUSED, true);
	if (!settings.apiKey) throw new GenerationError(OFF, false);

	// v1beta: the "-latest" model aliases and responseJsonSchema are only available there (v1 answers 404).
	const ai = new GoogleGenAI({
		apiKey: settings.apiKey,
		apiVersion: 'v1beta',
		httpOptions: { timeout: TIMEOUT_MS }
	});

	// Free-tier Gemini is often overloaded: two attempts, the main model and then the fallback one.
	// More would make the user wait longer and use up the daily quota faster; "Bandyti dar kartą" starts over.
	const main = settings.model || DEFAULT_MODEL;
	const models = main === FALLBACK_MODEL ? [main, main] : [main, FALLBACK_MODEL];
	const started = Date.now();
	const outOfQuota = new Set<string>(); // free tier: each model has its own daily request limit
	let response;
	for (const [attempt, model] of models.entries()) {
		if (outOfQuota.has(model)) continue;
		try {
			response = await ai.models.generateContent({
				model,
				contents: user,
				config: {
					systemInstruction: SYSTEM_PROMPT,
					responseMimeType: 'application/json',
					responseJsonSchema: RECOMMENDATION_SCHEMA
				}
			});
			break;
		} catch (error) {
			// 429: this model's free-tier quota is used up, so only the other model can still answer.
			// Overloaded, timed out (no status) or network errors: try again with the next model.
			// Other 4xx: a wrong key, model name or request, so retrying won't help.
			const status = error instanceof ApiError ? error.status : undefined;
			if (status === 429) outOfQuota.add(model);
			const next = models.slice(attempt + 1).find((other) => !outOfQuota.has(other));
			const delay = status === 429 ? 0 : (RETRY_DELAYS_MS[attempt] ?? 0);
			const timeLeft = Date.now() - started + delay + TIMEOUT_MS <= TOTAL_MS;
			if (next && timeLeft && (status === undefined || status === 429 || OVERLOADED.has(status))) {
				console.warn(`Gemini ${model} failed (${status ?? String(error)}), trying ${next} in ${delay / 1000} s`);
				await new Promise((done) => setTimeout(done, delay));
				continue;
			}
			if (status === 429) throw new GenerationError(BUSY, true, { cause: error });
			const retry = !(status && status >= 400 && status < 500);
			throw new GenerationError(retry ? FAILED : OFF, retry, { cause: error });
		}
	}
	if (!response) throw new GenerationError(FAILED, true, { cause: new Error('no answer') });

	const finish = response.candidates?.[0]?.finishReason;
	if (response.promptFeedback?.blockReason || (finish && finish !== FinishReason.STOP && finish !== FinishReason.MAX_TOKENS)) {
		throw new GenerationError(REFUSED, true, { cause: new Error(`blocked: ${response.promptFeedback?.blockReason ?? finish}`) });
	}
	if (finish === FinishReason.MAX_TOKENS) throw new GenerationError(FAILED, true, { cause: new Error('max tokens') });
	if (!response.text) throw new GenerationError(FAILED, true, { cause: new Error('empty answer') });
	return response.text;
}

/**
 * UC-7: generates recommendations for the user's open trip, stores them as its `plan` (the trip then moves to the
 * history) and returns the trip id. Throws GenerationError with a Lithuanian message.
 */
export async function generateRecommendations(userId: string, settings: LlmSettings): Promise<string> {
	const [hike, user, inventory] = await Promise.all([
		Hike.findOne(openTrip(userId)).sort({ createdAt: -1 }).lean(),
		User.findById(userId, 'consents fitnessAssessment.level').lean(),
		listItems(userId)
	]);
	if (!hike) throw new GenerationError(NO_TRIP, false);
	if (!hasConsent(user?.consents)) throw new GenerationError(NO_CONSENT, false);

	const departureDate = iso(hike.departureDate);
	const returnDate = iso(hike.returnDate);
	const fitnessLevel = (user?.fitnessAssessment?.level as FitnessLevel | undefined) ?? null;
	const { user: content, keyed } = buildRequest({
		trip: {
			location: hike.location,
			departureDate,
			returnDate,
			days: tripDays(departureDate, returnDate),
			season: seasonOf(departureDate)
		},
		fitnessLevel,
		inventory
	});

	const answer = await askModel(settings, content, () => mockAnswer(keyed, fitnessLevel));
	let recommendations;
	try {
		recommendations = parseRecommendations(answer, keyed);
	} catch (error) {
		if (error instanceof InvalidAnswer) throw new GenerationError(FAILED, true, { cause: error });
		throw error;
	}

	const now = new Date();
	const plan = {
		request: {
			createdAt: now,
			sentContent: `${SYSTEM_PROMPT}\n\n${content}`,
			usedItemIds: inventory.map((item) => item.id)
		},
		recommendations: { ...recommendations, generatedAt: now }
	};
	// Only a trip that still has no plan: a second click must not overwrite what was generated (history stays as generated).
	const { matchedCount } = await Hike.updateOne(
		{ _id: hike._id, ...openTrip(userId) },
		{ $set: { plan } },
		{ runValidators: true }
	);
	if (!matchedCount) throw new GenerationError(NO_TRIP, false);
	return hike._id.toString();
}
