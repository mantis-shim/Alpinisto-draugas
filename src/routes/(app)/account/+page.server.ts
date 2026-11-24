import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { FitnessLevel } from '#lib/domain.ts';
import { endSession, requireUser } from '#lib/server/auth.ts';
import { Hike, Item, Session, User } from '#lib/server/models.ts';
import type { Actions, PageServerLoad } from './$types';

// The account page shows the fitness level and links to the questionnaire (UC-5).
export const load: PageServerLoad = async ({ locals }) => {
	const { id } = requireUser(locals);
	const user = await User.findById(id, 'fitnessAssessment.level').lean();
	return { fitnessLevel: (user?.fitnessAssessment?.level as FitnessLevel | undefined) ?? null };
};

export const actions: Actions = {
	// UC-9: delete the account and everything that belongs to it (FR-54). No DB cascade, so list it all here.
	delete: async ({ locals, cookies }) => {
		const { id } = requireUser(locals);
		await Promise.all([
			Item.deleteMany({ userId: id }),
			Hike.deleteMany({ userId: id }),
			Session.deleteMany({ userId: id })
		]);
		await User.deleteOne({ _id: id }); // last, so a failure above can be retried while still logged in
		await endSession(cookies);
		redirect(303, `${resolve('/')}?deleted`);
	}
};
