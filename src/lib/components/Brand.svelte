<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<!-- "/" sends logged-in users on to /plan -->
<a class="brand" href={resolve('/')}>
	<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 25 13 9l5 8.5 3.5-5L28 25z" /></svg>
	Alpinisto draugas
</a>

<style>
	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-l);
		font-weight: 780;
		font-stretch: var(--stretch-display);
		color: var(--c-text);
		text-decoration: none;
	}
	svg {
		width: 1.75rem;
		fill: var(--c-primary);
	}
</style>
