<!-- Inventory item fields (UC-2), shared by the add form and the edit page. Put inside a <form>.
     `attributes` replaces the free-text attributes box (the photo review lists them one by one, UC-3). -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		CATEGORY_LABELS,
		ITEM_CATEGORIES,
		ITEM_LIMITS,
		TEMPERATURE_LABELS,
		TEMPERATURES
	} from '#lib/domain.ts';
	import type { ItemFormErrors, ItemFormValues } from '#lib/validation.ts';

	let { values, errors, attributes }: { values: ItemFormValues; errors: ItemFormErrors; attributes?: Snippet } =
		$props();

	// FR-12: name suggestions while typing (native <datalist>, no JS)
	const SUGGESTIONS = [
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
</script>

<div class="field">
	<label for="item-name">Pavadinimas</label>
	<input
		id="item-name"
		name="name"
		list="item-suggestions"
		autocomplete="off"
		maxlength={ITEM_LIMITS.name}
		required
		value={values.name}
		aria-invalid={errors.name ? 'true' : undefined}
		aria-describedby={errors.name ? 'item-name-error' : undefined}
	/>
	<datalist id="item-suggestions">
		{#each SUGGESTIONS as suggestion (suggestion)}<option value={suggestion}></option>{/each}
	</datalist>
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

{#if attributes}
	{@render attributes()}
{:else}
	<div class="field">
		<label for="item-attributes">Kiti požymiai</label>
		<textarea
			id="item-attributes"
			name="attributes"
			value={values.attributes}
			aria-invalid={errors.attributes ? 'true' : undefined}
			aria-describedby={errors.attributes ? 'item-attributes-hint item-attributes-error' : 'item-attributes-hint'}
		></textarea>
		<p class="field-hint" id="item-attributes-hint">
			Kiekvienas požymis naujoje eilutėje, pvz., „spalva: ruda“ arba „neperšlampamas“. Neprivaloma.
		</p>
		{#if errors.attributes}<p class="field-error" id="item-attributes-error">{errors.attributes}</p>{/if}
	</div>
{/if}
