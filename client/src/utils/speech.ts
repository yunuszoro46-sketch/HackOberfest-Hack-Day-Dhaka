/**
 * Voice Dispatcher using Web Speech API (speechSynthesis)
 * Optional spoken readouts for AI planning summaries.
 */

class VoiceDispatcher {
  private muted: boolean = false;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const savedMute = localStorage.getItem('oncall_voice_muted');
      this.muted = savedMute === 'true';

      if ('speechSynthesis' in window) {
        this.loadVoice();
        window.speechSynthesis.onvoiceschanged = () => this.loadVoice();
      }
    }
  }

  private loadVoice() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    // Prefer crisp English voices for technical dispatch telemetry
    this.voice =
      voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha'))) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      voices[0] ||
      null;
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(val: boolean) {
    this.muted = val;
    if (typeof window !== 'undefined') {
      localStorage.setItem('oncall_voice_muted', val ? 'true' : 'false');
      if (val && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  }

  public speak(
    text: string,
    opts: { rate?: number; pitch?: number; volume?: number; interrupt?: boolean } = {}
  ) {
    if (this.muted || !this.isSupported()) return;

    try {
      if (opts.interrupt ?? true) {
        window.speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      if (this.voice) {
        utterance.voice = this.voice;
      }
      utterance.rate = opts.rate ?? 1.05; // Slightly fast, disciplined pace
      utterance.pitch = opts.pitch ?? 0.95; // Grounded dispatcher tone
      utterance.volume = opts.volume ?? 1.0;

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis dispatch failed:', err);
    }
  }

  public stop() {
    if (this.isSupported()) {
      window.speechSynthesis.cancel();
    }
  }

  public testVoice() {
    this.speak('TeamMate voice dispatch operational. All telemetry channels live.');
  }

  public speakAssessment(score: number, title: string) {
    const text = `Assessment complete for ${title}. Feasibility score: ${score} out of one hundred. Awaiting human key approval.`;
    this.speak(text, { interrupt: true });
  }
}

export const voiceDispatcher = new VoiceDispatcher();
