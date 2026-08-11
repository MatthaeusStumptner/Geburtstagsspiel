<script>
  let { session, section, component: Component } = $props();
  let snapshot = $derived($session);
</script>

<Component state={snapshot[section]} command={session.command} />
