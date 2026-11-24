// Fitness questionnaire (UC-5, FR-31–34): answer rules and the level formula.
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

// Upper bounds of realistic answers (~38 km a day; about one mountain hike a week)
const MAX: Record<FitnessQuestion, number> = { averageDailySteps: 50_000, hikesLast3Years: 150 };
// Fewer than 500 steps a day is unrealistic even for an inactive person. Hikes may be 0.
const MIN: Record<FitnessQuestion, number> = { averageDailySteps: 500, hikesLast3Years: 0 };
const TOO_SMALL = 'Įvesk bent apytikslį skaičių, pvz., 2000. Net nedaug judantys žmonės per dieną nueina kelis šimtus žingsnių.';
const TOO_BIG: Record<FitnessQuestion, string> = {
	averageDailySteps: 'Patikrink skaičių: ne daugiau kaip 50 000 žingsnių per dieną.',
	hikesLast3Years: 'Patikrink skaičių: ne daugiau kaip 150 žygių per 3 metus.'
};

export const stepsPoints = (steps: number) => (steps >= 12_000 ? 3 : steps >= 8_000 ? 2 : steps >= 5_000 ? 1 : 0);
export const hikesPoints = (hikes: number) => (hikes >= 6 ? 3 : hikes >= 3 ? 2 : hikes >= 1 ? 1 : 0);

/** Sum of points 0–6: 0–2 LOW, 3–4 MEDIUM, 5–6 HIGH. One strong answer can't make up for a weak other one. */
export function fitnessLevel({ averageDailySteps, hikesLast3Years }: FitnessAnswers): FitnessLevel {
	const points = stepsPoints(averageDailySteps) + hikesPoints(hikesLast3Years);
	return points >= 5 ? 'HIGH' : points >= 3 ? 'MEDIUM' : 'LOW';
}

/** A whole number ≥ 0, or the message to show next to the field. Spaces are allowed ("10 000"). */
function parseCount(raw: string, question: FitnessQuestion): number | string {
	const value = raw.replace(/\s/g, '');
	if (!value) return 'Atsakyk į šį klausimą.';
	if (!/^\d+$/.test(value)) return 'Įvesk sveiką skaičių, pvz., 6000.';
	const count = Number(value);
	if (count < MIN[question]) return TOO_SMALL;
	if (count > MAX[question]) return TOO_BIG[question];
	return count;
}

/** Checks every answer (FR-32). Returns the answers, or an error per unanswered or invalid question. */
export function parseFitnessAnswers(
	values: FitnessFormValues
): { answers: FitnessAnswers; errors?: undefined } | { errors: FitnessErrors; answers?: undefined } {
	const steps = parseCount(values.averageDailySteps, 'averageDailySteps');
	const hikes = parseCount(values.hikesLast3Years, 'hikesLast3Years');

	const errors: FitnessErrors = {};
	if (typeof steps === 'string') errors.averageDailySteps = steps;
	if (typeof hikes === 'string') errors.hikesLast3Years = hikes;
	if (typeof steps === 'string' || typeof hikes === 'string') return { errors };

	return { answers: { averageDailySteps: steps, hikesLast3Years: hikes } };
}
