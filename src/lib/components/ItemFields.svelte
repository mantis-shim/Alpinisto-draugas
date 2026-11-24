<!-- Inventory item fields (UC-2), shared by the add form (also pre-filled from a photo, UC-3) and the edit page.
     Put inside a <form>. `attributeNames`: names the user already uses, suggested for "Požymis". -->
<script lang="ts">
	import { on } from 'svelte/events';
	import Combobox from '#lib/components/Combobox.svelte';
	import {
		CATEGORY_LABELS,
		ITEM_CATEGORIES,
		ITEM_LIMITS,
		TEMPERATURE_LABELS,
		TEMPERATURES
	} from '#lib/domain.ts';
	import {
		attributeText,
		fold,
		groupAttributes,
		parseAttributes,
		typedAttribute,
		type ItemFormErrors,
		type ItemFormValues
	} from '#lib/validation.ts';

	let {
		values,
		errors,
		attributeNames = []
	}: { values: ItemFormValues; errors: ItemFormErrors; attributeNames?: string[] } = $props();

	// FR-12: name suggestions while typing
	const ITEM_NAMES = [
		'Žygio batai',
		'Kuprinė',
		'Neperšlampama striukė',
		'Flisinis džemperis',
		'Termo apatiniai',
		'Kepurė',
		'Pirštinės',
		'Žygio kojinės',
		'Miegmaišis',
		'Kilimėlis',
		'Palapinė',
		'Žemėlapis',
		'Kompasas',
		'Galvos žibintuvėlis',
		'Vaistinėlė',
		'Gertuvė',
		'Termosas',
		'Žygio lazdos',
		'Saulės akiniai',
		'Kremas nuo saulės',
		'Priemonė nuo uodų',
		'Kišeninis peilis',
		'Išorinė baterija'
	];
	const COMMON_ATTRIBUTES = ['spalva', 'medžiaga', 'svoris', 'dydis', 'talpa', 'komforto temperatūra', 'neperšlampamas'];
	// common ones first, then the user's own; "Spalva" and "spalva" are one suggestion
	const attributeOptions = $derived([
		...new Map([...COMMON_ATTRIBUTES, ...attributeNames].map((n) => [fold(n), n])).values()
	]);

	let name = $derived(values.name); // what is typed; new `values` (pre-fill, server errors) replace it

	// "Kiti požymiai" as tags. Each tag is its own hidden field and the pair being typed is submitted too, so it's
	// never lost on "Išsaugoti"; readItemForm joins them.
	let tags = $derived(parseAttributes(values.attributes));
	const grouped = $derived(groupAttributes(tags));
	// The pair being typed. New `values` clear it: a server answer already holds it as a tag, a pre-fill starts over.
	let attributeName = $derived.by(() => (void values, ''));
	let attributeValue = $derived.by(() => (void values, ''));
	let attributeNameInput = $state<HTMLInputElement>();
	let attributeValueInput = $state<HTMLInputElement>();
	const same = (a: { name: string; value: string }, b: typeof a) =>
		fold(a.name) === fold(b.name) && fold(a.value) === fold(b.value);

	function addTag() {
		const tag = typedAttribute(attributeName, attributeValue);
		if (tag && !tags.some((t) => same(t, tag))) tags = [...tags, tag];
		attributeName = attributeValue = '';
		attributeNameInput?.focus();
	}
</script>

<div class="field">
	<label for="item-name">Pavadinimas</label>
	<Combobox
		id="item-name"
		name="name"
		label="Dažni daiktai"
		options={ITEM_NAMES}
		maxlength={ITEM_LIMITS.name}
		required
		bind:value={name}
		aria-invalid={errors.name ? 'true' : undefined}
		aria-describedby={errors.name ? 'item-name-error' : undefined}
	/>
	{#if errors.name}<p class="field-error" id="item-name-error">{errors.name}</p>{/if}
</div>

<div class="field">
	<label for="item-category">Kategorija</label>
	<select
		id="item-category"
		name="category"
		required
		value={values.category}
		aria-invalid={errors.category ? 'true' : undefined}
		aria-describedby={errors.category ? 'item-category-error' : undefined}
	>
		<option value="">Pasirink kategoriją</option>
		{#each ITEM_CATEGORIES as category (category)}
			<option value={category}>{CATEGORY_LABELS[category]}</option>
		{/each}
	</select>
	{#if errors.category}<p class="field-error" id="item-category-error">{errors.category}</p>{/if}
</div>

<fieldset>
	<legend>Kokiam orui tinka</legend>
	{#each TEMPERATURES as temperature (temperature)}
		<label>
			<input
				type="checkbox"
				name="suitability"
				value={temperature}
				checked={values.suitability.includes(temperature)}
			/>
			{TEMPERATURE_LABELS[temperature]}
		</label>
	{/each}
</fieldset>

<!-- a form reset (closing the add popup, after saving) puts the tags back to `values` -->
<fieldset {@attach (set) => on(set.closest('form')!, 'reset', () => (tags = parseAttributes(values.attributes)))}>
	<legend>Kiti požymiai</legend>
	{#if tags.length}
		<ul class="tag-list" aria-label="Pridėti požymiai">
			{#each grouped as { attribute, hue } (attribute)}
				{@const text = attributeText(attribute)}
				<li class="tag" class:tag-hue={hue !== undefined} style:--hue={hue}>
					{text}
					<input type="hidden" name="attributes" value={text} />
					<button type="button" aria-label="Pašalinti „{text}“" onclick={() => (tags = tags.filter((t) => t !== attribute))}>
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	<!-- Enter: name -> value -> add, so the keyboard alone adds a tag and Enter never submits the form here -->
	<div class="tag-add">
		<div class="field">
			<label for="item-attribute-name">Požymis</label>
			<Combobox
				id="item-attribute-name"
				name="attributeName"
				label="Požymiai"
				options={attributeOptions}
				placeholder="pvz., spalva"
				maxlength={ITEM_LIMITS.attributeText}
				bind:value={attributeName}
				bind:ref={attributeNameInput}
				aria-invalid={errors.attributes ? 'true' : undefined}
				aria-describedby={errors.attributes ? 'item-attributes-hint item-attributes-error' : 'item-attributes-hint'}
				onkeydown={(e) => {
					if (e.key === 'Enter' && attributeName.trim()) {
						e.preventDefault();
						attributeValueInput?.focus();
					}
				}}
			/>
		</div>
		<div class="field">
			<label for="item-attribute-value">Reikšmė</label>
			<input
				bind:this={attributeValueInput}
				id="item-attribute-value"
				name="attributeValue"
				autocomplete="off"
				placeholder="pvz., ruda"
				maxlength={ITEM_LIMITS.attributeText}
				bind:value={attributeValue}
				onkeydown={(e) => {
					if (e.key === 'Enter' && (attributeName.trim() || attributeValue.trim())) {
						e.preventDefault();
						addTag();
					}
				}}
			/>
		</div>
		<button type="button" class="button-secondary" onclick={addTag} disabled={tags.length >= ITEM_LIMITS.attributes}>
			Pridėti požymį
		</button>
	</div>
	<p class="field-hint" id="item-attributes-hint">
		Neprivaloma. Požymiui be reikšmės, pvz., „neperšlampamas“, reikšmę palik tuščią.
	</p>
	{#if errors.attributes}<p class="field-error" id="item-attributes-error">{errors.attributes}</p>{/if}
</fieldset>

<style>
	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: var(--space-1) 0 var(--space-4);
		padding: 0;
		list-style: none;
	}
	.tag-list li {
		gap: var(--space-1);
		margin: 0;
		padding-right: var(--space-1);
	}
	.tag-list button {
		width: 1.5rem; /* 24px: the smallest comfortable touch target */
		min-height: 1.5rem;
		padding: 0;
		color: inherit;
		background: transparent;
		border-radius: var(--radius-s);
	}
	.tag-list button:hover {
		background: color-mix(in srgb, currentColor 15%, transparent);
	}
	.tag-list svg {
		width: 1rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.5;
		stroke-linecap: round;
	}
	/* one row when there's room; on phones the button wraps under the two fields */
	.tag-add {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0 var(--space-3);
	}
	.tag-add .field {
		flex: 1 1 8rem;
	}
	.tag-add button {
		margin-bottom: var(--space-4); /* level with the inputs, whose .field has this margin */
	}
	fieldset > .field-hint,
	fieldset > .field-error {
		margin-bottom: var(--space-2);
	}
</style>
