"use client";

// Voice readout (Web Speech API). Reads stage summaries aloud when the Voice toggle is on; nothing else.
const KEY = "teammate:voice";

class VoiceReadout {
  private enabled = false;
  private voice: SpeechSynthesisVoice | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    if (typeof window === "undefined") return;
    try {
      this.enabled = localStorage.getItem(KEY) === "on";
    } catch {
      // storage blocked: voice stays off
    }
    if ("speechSynthesis" in window) {
      this.loadVoice();
      window.speechSynthesis.onvoiceschanged = () => this.loadVoice();
    }
  }

  private loadVoice() {
    const voices = window.speechSynthesis.getVoices();
    this.voice = voices.find((v) => v.lang.startsWith("en") && /Natural|Google|Samantha/.test(v.name)) ?? voices.find((v) => v.lang.startsWith("en")) ?? voices[0] ?? null;
  }

  isSupported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  isEnabled() {
    return this.enabled;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
    } catch {
      // ignore
    }
    if (!on && this.isSupported()) window.speechSynthesis.cancel();
    this.listeners.forEach((l) => l());
  }

  /** Speaks a stage summary if voice is on. */
  say(text: string) {
    if (this.enabled) this.read(text);
  }

  /** Reads text aloud on an explicit request (e.g. "Read aloud"), whatever the toggle says. */
  read(text: string) {
    if (!this.isSupported()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  }

  stop() {
    if (this.isSupported()) window.speechSynthesis.cancel();
  }
}

export const voice = new VoiceReadout();
