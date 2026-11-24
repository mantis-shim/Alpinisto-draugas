<!-- Text input with our own suggestion list under it (item name, "Požymis"). Not <datalist>: the browser's popup can't be
     styled, and in a modal <dialog> Chrome draws it beside the field. Typing filters it, ignoring Lithuanian letters;
     arrows + Enter pick, Escape closes only the list. Other attributes (name, maxlength, aria-*) go to the <input>.
     ponytail: without JS there are no suggestions; the field still works. -->
<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { fold } from '#lib/validation.ts';

	let {
		id,
		options,
		label,
		value = $bindable(''),
		ref = $bindable(),
		onkeydown: parentKeydown,
		...rest
	}: HTMLInputAttributes & {
		id: string;
		options: string[];
		label: string; // names the list for screen readers
		value?: string;
		ref?: HTMLInputElement;
	} = $props();

	let open = $state(false);
	let active = $state(-1); // highlighted option, for the arrow keys
	const matches = $derived(options.filter((o) => o !== value && fold(o).includes(fold(value.trim()))));
	const expanded = $derived(open && matches.length > 0);

	function show() {
		open = true;
		active = -1;
	}
	function pick(option: string) {
		value = option;
		open = false;
	}
	function onkeydown(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (!expanded) return show();
			const step = e.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + matches.length) % matches.length;
		} else if (e.key === 'Enter' && expanded && active >= 0) {
			e.preventDefault(); // pick, don't submit
			pick(matches[active]);
		} else if (e.key === 'Escape' && expanded) {
			e.preventDefault(); // close the list, not the popup around the form
			open = false;
		} else parentKeydown?.(e);
	}
</script>

<div class="combobox">
	<input
		{...rest}
		{id}
		role="combobox"
		aria-autocomplete="list"
		aria-controls="{id}-options"
		aria-expanded={expanded}
		aria-activedescendant={expanded && active >= 0 ? `${id}-option-${active}` : undefined}
		autocomplete="off"
		bind:value
		bind:this={ref}
		oninput={show}
		onclick={show}
		onblur={() => (open = false)}
		{onkeydown}
	/>
	<ul id="{id}-options" role="listbox" aria-label={label} hidden={!expanded}>
		{#each matches as option, i (option)}
			<!-- mousedown would blur the field and close the list before the click lands. Keyboard: arrows + Enter on the
			     field (combobox pattern), so the option itself needs no key handler. -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<li
				id="{id}-option-{i}"
				role="option"
				aria-selected={i === active}
				onmousedown={(e) => e.preventDefault()}
				onclick={() => pick(option)}
				{@attach i === active && ((li) => li.scrollIntoView({ block: 'nearest' }))}
			>
				{option}
			</li>
		{/each}
	</ul>
</div>

<style>
	.combobox {
		position: relative;
	}
	ul {
		position: absolute;
		inset: calc(100% + var(--space-1)) 0 auto;
		z-index: 1;
		min-width: 12rem;
		max-height: 15rem; /* scrolls; about six options */
		margin: 0;
		padding: var(--space-1);
		overflow-y: auto;
		overscroll-behavior: contain;
		list-style: none;
		background: var(--c-surface);
		border: 1px solid var(--c-line-strong);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-overlay);
	}
	li {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-s);
		cursor: pointer;
	}
	li:hover,
	li[aria-selected='true'] {
		background: var(--c-primary-soft);
	}
</style>
