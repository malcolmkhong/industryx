// ============================================
// FACTORY DOMINION: AUTOMATED EMPIRE
// Sound Engine - Web Audio API Synthesized Sounds
// ============================================

type SoundName =
  | 'buildingPlaced'
  | 'resourceProduced'
  | 'moneyEarned'
  | 'researchComplete'
  | 'contractCompleted'
  | 'eventTriggered'
  | 'powerOverload'
  | 'levelUp'
  | 'buttonClick'
  | 'error';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterVolume: number = 0.5;
  private categories: Record<string, number> = {
    building: 0.7,
    production: 0.5,
    events: 0.8,
    ui: 0.6,
  };
  private enabled: boolean = true;

  /**
   * Initialize the AudioContext. Must be called from a user gesture handler.
   */
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      // AudioContext not available
    }
  }

  /**
   * Ensure the AudioContext is running (resume if suspended).
   */
  private ensureContext() {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Play a synthesized sound by name and category.
   */
  play(soundName: SoundName, category: string) {
    if (!this.enabled) return;
    if (this.masterVolume <= 0) return;

    const categoryVolume = this.categories[category] ?? 0.5;
    if (categoryVolume <= 0) return;

    this.ensureContext();
    if (!this.ctx) return;

    const volume = this.masterVolume * categoryVolume;
    const now = this.ctx.currentTime;

    try {
      switch (soundName) {
        case 'buildingPlaced':
          this.playBuildingPlaced(now, volume);
          break;
        case 'resourceProduced':
          this.playResourceProduced(now, volume);
          break;
        case 'moneyEarned':
          this.playMoneyEarned(now, volume);
          break;
        case 'researchComplete':
          this.playResearchComplete(now, volume);
          break;
        case 'contractCompleted':
          this.playContractCompleted(now, volume);
          break;
        case 'eventTriggered':
          this.playEventTriggered(now, volume);
          break;
        case 'powerOverload':
          this.playPowerOverload(now, volume);
          break;
        case 'levelUp':
          this.playLevelUp(now, volume);
          break;
        case 'buttonClick':
          this.playButtonClick(now, volume);
          break;
        case 'error':
          this.playError(now, volume);
          break;
      }
    } catch {
      // Silently fail - sound is non-critical
    }
  }

  // --- Sound Generators ---

  /**
   * Building placed: Short "thunk" sound (low frequency burst)
   */
  private playBuildingPlaced(now: number, volume: number) {
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);

    gain.gain.setValueAtTime(volume * 0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);

    // Add a noise-like click layer
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();

    osc2.type = 'square';
    osc2.frequency.setValueAtTime(200, now);
    osc2.frequency.exponentialRampToValueAtTime(80, now + 0.05);

    gain2.gain.setValueAtTime(volume * 0.3, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);

    osc2.start(now);
    osc2.stop(now + 0.06);
  }

  /**
   * Resource produced: Soft "ding" (high frequency short sine)
   */
  private playResourceProduced(now: number, volume: number) {
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);

    gain.gain.setValueAtTime(volume * 0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * Money earned: Cash register "cha-ching" (two-tone ascending)
   */
  private playMoneyEarned(now: number, volume: number) {
    if (!this.ctx) return;

    // First tone
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587, now);

    gain1.gain.setValueAtTime(volume * 0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.1);

    // Second tone (higher)
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.1);

    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.setValueAtTime(volume * 0.4, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);

    osc2.start(now + 0.1);
    osc2.stop(now + 0.25);
  }

  /**
   * Research complete: Success fanfare (ascending tones)
   */
  private playResearchComplete(now: number, volume: number) {
    if (!this.ctx) return;

    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    const noteDuration = 0.1;
    const totalDuration = notes.length * noteDuration + 0.05;

    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      const start = now + i * noteDuration;
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.setValueAtTime(volume * 0.35, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + noteDuration);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(start);
      osc.stop(start + noteDuration);
    });

    // Shimmer overlay
    const shimmer = this.ctx.createOscillator();
    const shimmerGain = this.ctx.createGain();

    shimmer.type = 'triangle';
    shimmer.frequency.setValueAtTime(2093, now + totalDuration - 0.1);

    shimmerGain.gain.setValueAtTime(0.001, now + totalDuration - 0.1);
    shimmerGain.gain.setValueAtTime(volume * 0.15, now + totalDuration - 0.05);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + totalDuration + 0.1);

    shimmer.connect(shimmerGain);
    shimmerGain.connect(this.ctx.destination);

    shimmer.start(now + totalDuration - 0.1);
    shimmer.stop(now + totalDuration + 0.1);
  }

  /**
   * Contract completed: Achievement sound (major chord)
   */
  private playContractCompleted(now: number, volume: number) {
    if (!this.ctx) return;

    const chord = [523, 659, 784]; // C5, E5, G5 - major chord

    chord.forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(volume * 0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    });

    // High bell note
    const bell = this.ctx.createOscillator();
    const bellGain = this.ctx.createGain();

    bell.type = 'sine';
    bell.frequency.setValueAtTime(1568, now + 0.05);

    bellGain.gain.setValueAtTime(volume * 0.2, now + 0.05);
    bellGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    bell.connect(bellGain);
    bellGain.connect(this.ctx.destination);

    bell.start(now + 0.05);
    bell.stop(now + 0.35);
  }

  /**
   * Event triggered: Alert sound (oscillating tone)
   */
  private playEventTriggered(now: number, volume: number) {
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(660, now + 0.1);
    osc.frequency.linearRampToValueAtTime(440, now + 0.2);
    osc.frequency.linearRampToValueAtTime(660, now + 0.3);

    gain.gain.setValueAtTime(volume * 0.2, now);
    gain.gain.setValueAtTime(volume * 0.25, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  /**
   * Power overload: Warning alarm (repeating buzz)
   */
  private playPowerOverload(now: number, volume: number) {
    if (!this.ctx) return;

    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      const start = now + i * 0.1;
      osc.frequency.setValueAtTime(200, start);

      gain.gain.setValueAtTime(volume * 0.3, start);
      gain.gain.setValueAtTime(0.001, start + 0.06);
      gain.gain.setValueAtTime(volume * 0.3, start + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(start);
      osc.stop(start + 0.1);
    }
  }

  /**
   * Level up: Celebration sound (ascending arpeggio)
   */
  private playLevelUp(now: number, volume: number) {
    if (!this.ctx) return;

    const notes = [440, 554, 659, 880, 1109, 1319]; // A4 ascending arpeggio
    const noteDuration = 0.07;

    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      const start = now + i * noteDuration;
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.setValueAtTime(volume * 0.3, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + noteDuration + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(start);
      osc.stop(start + noteDuration + 0.1);
    });
  }

  /**
   * Button click: UI click (very short blip)
   */
  private playButtonClick(now: number, volume: number) {
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.03);

    gain.gain.setValueAtTime(volume * 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * Error: Error buzz (low dissonant tone)
   */
  private playError(now: number, volume: number) {
    if (!this.ctx) return;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(120, now);

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(127, now); // slightly dissonant

    gain.gain.setValueAtTime(volume * 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.2);
    osc2.start(now);
    osc2.stop(now + 0.2);
  }

  // --- Public Setters ---

  setMasterVolume(v: number) {
    this.masterVolume = Math.max(0, Math.min(1, v / 100));
  }

  setCategoryVolume(category: string, v: number) {
    this.categories[category] = Math.max(0, Math.min(1, v / 100));
  }

  setEnabled(e: boolean) {
    this.enabled = e;
  }

  getIsEnabled(): boolean {
    return this.enabled;
  }

  getMasterVolume(): number {
    return this.masterVolume * 100;
  }

  getCategoryVolume(category: string): number {
    return (this.categories[category] ?? 0.5) * 100;
  }
}

// Singleton instance
export const soundEngine = new SoundEngine();
