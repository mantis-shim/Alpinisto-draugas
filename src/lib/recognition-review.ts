// UC-3 review in the browser (FR-20, FR-23–25): each recognised attribute is confirmed, edited or rejected, and only
// confirmed ones enter the inventory. Plain functions on the page's state, so scripts/check-recognition.ts tests them.
import { RECOGNITION_CHECK_BELOW } from '#lib/domain.ts';
import { attributeName, attributeText } from '#lib/validation.ts';

type Attribute = { name: string; value: string };

export type ReviewAttribute = Attribute & {
	status: 'pending' | 'confirmed' | 'rejected';
	draft?: Attribute; // being edited
};

/** FR-20: "Patikrinkite" below 70 %. Exactly 70 is not tagged. */
export const needsCheck = (confidence: number) => confidence < RECOGNITION_CHECK_BELOW;

export const startReview = (attributes: Attribute[]) =>
	attributes.map((attribute): ReviewAttribute => ({ ...attribute, status: 'pending' }));

export const isUndecided = (attribute: ReviewAttribute) => !!attribute.draft || attribute.status === 'pending';

/** Ends an edit, which confirms the attribute. Without a name the edit is dropped. */
export function finishEdit(attribute: ReviewAttribute) {
	const { draft } = attribute;
	const name = draft && attributeName(draft.name);
	if (draft && name) {
		attribute.name = name;
		attribute.value = draft.value.trim();
		attribute.status = 'confirmed';
	}
	attribute.draft = undefined;
}

/** FR-24 "Patvirtinti visus": everything not rejected. An open edit keeps what the user typed. */
export function confirmAll(attributes: ReviewAttribute[]) {
	for (const attribute of attributes) {
		if (attribute.draft) finishEdit(attribute);
		if (attribute.status === 'pending') attribute.status = 'confirmed';
	}
}

/** FR-25: the "Kiti požymiai" text ?/create saves, with confirmed attributes only. Null while any is undecided. */
export function confirmedAttributes(attributes: ReviewAttribute[]) {
	if (attributes.some(isUndecided)) return null;
	return attributes
		.filter((attribute) => attribute.status === 'confirmed')
		.map(attributeText)
		.join('\n');
}
