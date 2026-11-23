// Fitness questionnaire (UC-5, FR-31–34): answer rules and the level formula.
// Shared by the server action and the page. The backend assigns the level, never the AI.
import type { FitnessLevel } from '#lib/domain.ts';

export const FITNESS_LEVEL_LABELS: Record<FitnessLevel, string> = {
	LOW: 'žemas',
	MEDIUM: 'vidutinis',
	HIGH: 'aukštas'
};

export type FitnessAnswers = { averageDailySteps: number; hikesLast3Years: number };
export type FitnessQuestion = keyof FitnessAnswers;
export type FitnessErrors = Partial<Record<FitnessQuestion, string>>;

/** Raw form values, kept so the form can show what the user typed after an error. */
export type FitnessFormValues = Record<FitnessQuestion, string>;

// Upper bounds only catch typos (an extra zero); they are not part of the scoring.
const MAX: Record<FitnessQuestion, number> = { averageDailySteps: 100_000, hikesLast3Years: 1_000 };

/** Points per question: 0, 1 or 2. */
export const stepsPoints = (steps: number) => (steps >= 10_000 ? 2 : steps >= 5_000 ? 1 : 0);
export const hikesPoints = (hikes: number) => (hikes >= 3 ? 2 : hikes >= 1 ? 1 : 0);

/** Sum of points: 0–1 LOW, 2–3 MEDIUM, 4 HIGH (CLAUDE.md, UC-5). */
export function fitnessLevel({ averageDailySteps, hikesLast3Years }: FitnessAnswers): FitnessLevel {
	const points = stepsPoints(averageDailySteps) + hikesPoints(hikesLast3Years);
	return points >= 4 ? 'HIGH' : points >= 2 ? 'MEDIUM' : 'LOW';
}

/** A whole number ≥ 0, or the message to show next to the field. Spaces are allowed ("10 000"). */
function parseCount(raw: string, max: number): number | string {
	const value = raw.replace(/\s/g, '');
	if (!value) return 'Atsakyk į šį klausimą.';
	if (!/^\d+$/.test(value)) return 'Įvesk sveiką skaičių, pvz., 6000.';
	const count = Number(value);
	if (count > max) return `Skaičius per didelis. Įvesk ne daugiau kaip ${max}.`;
	return count;
}

/** Checks every answer (FR-32). Returns the answers, or an error per unanswered or invalid question. */
export function parseFitnessAnswers(
	values: FitnessFormValues
): { answers: FitnessAnswers; errors?: undefined } | { errors: FitnessErrors; answers?: undefined } {
	const steps = parseCount(values.averageDailySteps, MAX.averageDailySteps);
	const hikes = parseCount(values.hikesLast3Years, MAX.hikesLast3Years);

	const errors: FitnessErrors = {};
	if (typeof steps === 'string') errors.averageDailySteps = steps;
	if (typeof hikes === 'string') errors.hikesLast3Years = hikes;
	if (typeof steps === 'string' || typeof hikes === 'string') return { errors };

	return { answers: { averageDailySteps: steps, hikesLast3Years: hikes } };
}
