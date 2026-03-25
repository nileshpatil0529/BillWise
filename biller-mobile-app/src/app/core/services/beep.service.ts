import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class BeepService {
  private audioContext: AudioContext | null = null;

  constructor() {
    this.initAudioContext();
  }

  private initAudioContext(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported');
    }
  }

  /**
   * Play a success beep sound (higher pitch, pleasant tone)
   */
  playSuccess(): void {
    this.playBeep(880, 0.15, 'sine'); // A5 note, short duration
  }

  /**
   * Play an error beep sound (lower pitch, warning tone)
   */
  playError(): void {
    this.playBeep(220, 0.3, 'square'); // A3 note, longer duration, harsher sound
  }

  /**
   * Play a custom beep sound
   * @param frequency - Frequency in Hz (e.g., 440 for A4)
   * @param duration - Duration in seconds
   * @param type - Oscillator type: 'sine', 'square', 'sawtooth', 'triangle'
   */
  private playBeep(frequency: number, duration: number, type: OscillatorType = 'sine'): void {
    if (!this.audioContext) {
      this.initAudioContext();
    }

    if (!this.audioContext) {
      console.warn('Cannot play beep: AudioContext not available');
      return;
    }

    // Resume audio context if suspended (required by some browsers)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    // Fade out to prevent clicking sound
    gainNode.gain.setValueAtTime(0.5, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  /**
   * Play a double beep for success (more noticeable)
   */
  playDoubleBeep(): void {
    this.playBeep(880, 0.1, 'sine');
    setTimeout(() => {
      this.playBeep(1100, 0.15, 'sine');
    }, 120);
  }
}
