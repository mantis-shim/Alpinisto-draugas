<!-- Inventory item fields (UC-2), shared by the add form and the edit page. Put inside a <form>. -->
<script lang="ts">
	import { CATEGORY_LABELS, ITEM_CATEGORIES, TEMPERATURE_LABELS, TEMPERATURES } from '#lib/domain.ts';
	import type { ItemFormValues } from '#lib/validation.ts';

	let { values, errors }: { values: ItemFormValues; errors: { name?: string; category?: string } } =
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
		maxlength="100"
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

<div class="field">
	<label for="item-attributes">Kiti požymiai</label>
	<textarea id="item-attributes" name="attributes" aria-describedby="item-attributes-hint" value={values.attributes}
	></textarea>
	<p class="field-hint" id="item-attributes-hint">
		Kiekvienas požymis naujoje eilutėje, pvz., „spalva: ruda“ arba „neperšlampamas“. Neprivaloma.
	</p>
</div>
