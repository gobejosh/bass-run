/**
 * Contexte audio partagé. Les navigateurs n'autorisent le son qu'après un geste :
 * unlockAudio() doit être appelé de façon synchrone dans un gestionnaire de clic.
 */
let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!ctx) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctx({ latencyHint: "interactive" });
  }
  return ctx;
}

export function unlockAudio(): void {
  const c = audioContext();
  if (c.state !== "running") void c.resume();
  // Un tampon silencieux finit de déverrouiller iOS.
  const src = c.createBufferSource();
  src.buffer = c.createBuffer(1, 1, 22050);
  src.connect(c.destination);
  src.start(0);
}
