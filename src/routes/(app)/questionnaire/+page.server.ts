import { fail } from '@sveltejs/kit';
import type { FitnessLevel } from '#lib/domain.ts';
import { fitnessLevel, parseFitnessAnswers, type FitnessFormValues } from '#lib/fitness.ts';
import { requireUser } from '#lib/server/auth.ts';
import { User } from '#lib/server/models.ts';
import type { Actions, PageServerLoad } from './$types';

// FR-34: previous answers are shown so the user can review and change them.
export const load: PageServerLoad = async ({ locals }) => {
	const { id } = requireUser(locals);
	const user = await User.findById(id, 'fitnessAssessment').lean();
	const saved = user?.fitnessAssessment;
	return {
		assessment: saved
			? {
					averageDailySteps: saved.averageDailySteps,
					hikesLast3Years: saved.hikesLast3Years,
					level: saved.level as FitnessLevel,
					completedDate: saved.completedDate.toISOString().slice(0, 10)
				}
			: null
	};
};

export const actions: Actions = {
	// UC-5: check every answer (FR-32), assign the level on the server (FR-33), save it (FR-34 recalculates on resubmit).
	default: async ({ request, locals }) => {
		const { id } = requireUser(locals);
		const data = await request.formData();
		const values: FitnessFormValues = {
			averageDailySteps: String(data.get('averageDailySteps') ?? ''),
			hikesLast3Years: String(data.get('hikesLast3Years') ?? '')
		};

		const result = parseFitnessAnswers(values);
		if (result.errors) return fail(400, { values, errors: result.errors });

		const level = fitnessLevel(result.answers);
		await User.updateOne(
			{ _id: id },
			{ fitnessAssessment: { ...result.answers, level, completedDate: new Date() } }
		);
		return { saved: true };
	}
};
