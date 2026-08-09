<script>
  import OnboardingWizard from './components/OnboardingWizard.svelte';
  import SettingsDialog from './components/SettingsDialog.svelte';

  let { session } = $props();
  let snapshot = $derived($session);
</script>

<SettingsDialog state={snapshot.settings} command={session.command} />
<OnboardingWizard state={snapshot.onboarding} command={session.command} />
