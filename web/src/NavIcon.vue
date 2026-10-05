<script setup lang="ts">
defineProps<{name:string}>();
const paths:Record<string,string[]>={
 resources:['M4 4h16v12H4z','M8 20h8M12 16v4','M7 10h2l2-3 2 6 2-3h2'],
 processes:['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2','M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8','M22 21v-2a4 4 0 0 0-3-3.87','M16 3.13a4 4 0 0 1 0 7.75'],
 alerts:['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9','M10 21h4'],
 assistant:['M4 4h16v12H9l-5 4V4','M8 8h8M8 12h5'],
 settings:['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8','M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z'],
 fold:['M3 5h18M3 12h5M3 19h18','M16 8l-4 4 4 4'],
 unfold:['M3 5h18M3 12h5M3 19h18','M12 8l4 4-4 4']
};
</script>
<template><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-for="(d,i) in paths[name]??paths.resources" :key="i" :d="d"/></svg></template>
