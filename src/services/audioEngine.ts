import { AudioDevice, AudioSettings, RogerBeepType } from '../types/mmdvm';
import { callsignToPhonetic, textToMorse } from './phonetics';

class AudioAlertEngine {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filterLow: BiquadFilterNode | null = null;
  private filterHigh: BiquadFilterNode | null = null;
  private analyser: AnalyserNode | null = null;
  private audioDestination: MediaStreamAudioDestinationNode | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private currentDeviceId: string = '';
  private isMuted: boolean = false;
  private activeVoices: SpeechSynthesisVoice[] = [];

  constructor() {
    // Lazy initialization on first user interaction
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.activeVoices = window.speechSynthesis.getVoices();
      };
      this.activeVoices = window.speechSynthesis.getVoices();
    }
  }

  private initContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();

      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = 0.8;

      // Bandpass simulation for VHF/UHF radio acoustics
      this.filterLow = this.audioCtx.createBiquadFilter();
      this.filterLow.type = 'highpass';
      this.filterLow.frequency.value = 350; // Cut off low rumble below 350Hz

      this.filterHigh = this.audioCtx.createBiquadFilter();
      this.filterHigh.type = 'lowpass';
      this.filterHigh.frequency.value = 3200; // Cut off high hiss above 3.2kHz (standard radio voice band)

      // Spectrum & Oscilloscope Analyser
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.8;

      // Pipeline: Nodes -> Analyser -> Master Gain
      this.filterLow.connect(this.filterHigh);
      this.filterHigh.connect(this.analyser);
      this.analyser.connect(this.masterGain);

      // Route to destination or audio element
      this.audioDestination = this.audioCtx.createMediaStreamDestination();
      this.masterGain.connect(this.audioCtx.destination);
      this.masterGain.connect(this.audioDestination);

      // Setup hidden audio element for setSinkId routing support
      if (typeof document !== 'undefined') {
        this.audioElement = document.createElement('audio');
        this.audioElement.autoplay = true;
        this.audioElement.srcObject = this.audioDestination.stream;
      }
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    return this.audioCtx;
  }

  /**
   * Enumerate available output audio devices (sound cards, USB radio interfaces, DACs)
   */
  public async getAvailableOutputDevices(): Promise<AudioDevice[]> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }

    try {
      // Request permission if needed so labels are not empty strings
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Immediately stop the temporary input stream
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        // May already have permissions or user declined mic, continue enumerating
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputDevices: AudioDevice[] = devices
        .filter((d) => d.kind === 'audiooutput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Audio Interface ${index + 1} (${d.deviceId.slice(0, 8)})`,
          groupId: d.groupId,
          kind: d.kind,
        }));

      // Ensure at least default entry exists
      if (outputDevices.length === 0) {
        outputDevices.push({
          deviceId: 'default',
          label: 'Default Audio Interface (Host System)',
          groupId: '',
          kind: 'audiooutput',
        });
      }

      return outputDevices;
    } catch (err) {
      console.warn('Failed to enumerate audio devices:', err);
      return [
        {
          deviceId: 'default',
          label: 'Default Audio Interface (System)',
          groupId: '',
          kind: 'audiooutput',
        },
      ];
    }
  }

  /**
   * Set target audio output interface using setSinkId
   */
  public async setAudioOutputDevice(deviceId: string): Promise<boolean> {
    this.currentDeviceId = deviceId;
    const ctx = this.initContext();

    let success = false;

    // 1. Try AudioContext.setSinkId (modern standard)
    if ('setSinkId' in ctx && typeof (ctx as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId === 'function') {
      try {
        await (ctx as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
        success = true;
      } catch (err) {
        console.warn('AudioContext.setSinkId failed, trying HTMLAudioElement:', err);
      }
    }

    // 2. Try HTMLAudioElement.setSinkId (fallback for browsers where context doesn't expose setSinkId)
    if (this.audioElement && 'setSinkId' in this.audioElement) {
      try {
        await (this.audioElement as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
        success = true;
      } catch (err) {
        console.warn('HTMLAudioElement.setSinkId error:', err);
      }
    }

    return success;
  }

  /**
   * Update audio pipeline parameters
   */
  public updateSettings(settings: AudioSettings) {
    this.initContext();
    if (this.masterGain && this.audioCtx) {
      const targetGain = this.isMuted ? 0 : Math.max(0, Math.min(1, settings.volume));
      this.masterGain.gain.setValueAtTime(targetGain, this.audioCtx.currentTime);
    }

    // Toggle radio bandpass filter
    if (this.filterLow && this.filterHigh && this.audioCtx) {
      if (settings.radioFilterEnabled) {
        this.filterLow.frequency.setValueAtTime(350, this.audioCtx.currentTime);
        this.filterHigh.frequency.setValueAtTime(3200, this.audioCtx.currentTime);
      } else {
        // Wide open frequency response
        this.filterLow.frequency.setValueAtTime(20, this.audioCtx.currentTime);
        this.filterHigh.frequency.setValueAtTime(20000, this.audioCtx.currentTime);
      }
    }

    if (settings.selectedDeviceId && settings.selectedDeviceId !== this.currentDeviceId) {
      this.setAudioOutputDevice(settings.selectedDeviceId);
    }
  }

  /**
   * Get available SpeechSynthesis voices
   */
  public getVoices(): SpeechSynthesisVoice[] {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (this.activeVoices.length === 0) {
        this.activeVoices = window.speechSynthesis.getVoices();
      }
      return this.activeVoices;
    }
    return [];
  }

  /**
   * Get AnalyserNode for visualizer
   */
  public getAnalyser(): AnalyserNode | null {
    if (!this.analyser) {
      this.initContext();
    }
    return this.analyser;
  }

  /**
   * Play a clean sine/square audio tone
   */
  public playTone(frequency: number, durationSeconds: number, type: OscillatorType = 'sine', gainMultiplier = 0.5): Promise<void> {
    return new Promise((resolve) => {
      const ctx = this.initContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(gainMultiplier, ctx.currentTime + 0.005);
      gain.gain.setValueAtTime(gainMultiplier, ctx.currentTime + durationSeconds - 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + durationSeconds);

      osc.connect(gain);
      gain.connect(this.filterLow!);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + durationSeconds);

      osc.onended = () => {
        gain.disconnect();
        resolve();
      };
    });
  }

  /**
   * Play realistic Ham Radio PTT mic click
   */
  public playMicClick(): Promise<void> {
    return new Promise((resolve) => {
      const ctx = this.initContext();
      const bufferSize = ctx.sampleRate * 0.025; // 25ms click
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Generate sharp pop transient
      for (let i = 0; i < bufferSize; i++) {
        const decay = Math.exp(-i / (ctx.sampleRate * 0.004));
        data[i] = (Math.random() * 2 - 1) * decay;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, ctx.currentTime);

      noise.connect(gain);
      gain.connect(this.filterLow!);

      noise.start();
      noise.onended = () => {
        gain.disconnect();
        resolve();
      };
    });
  }

  /**
   * Play realistic squelch burst (radio squelch tail)
   */
  public playSquelchTail(durationMs = 90): Promise<void> {
    return new Promise((resolve) => {
      const ctx = this.initContext();
      const seconds = durationMs / 1000;
      const bufferSize = Math.floor(ctx.sampleRate * seconds);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Pinkish/white noise with sharp decay
      for (let i = 0; i < bufferSize; i++) {
        const t = i / bufferSize;
        const env = t < 0.1 ? t / 0.1 : Math.max(0, 1 - (t - 0.1) / 0.9);
        data[i] = (Math.random() * 2 - 1) * env * 0.35;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(1400, ctx.currentTime);
      bandpass.Q.setValueAtTime(1.5, ctx.currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, ctx.currentTime);

      noise.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(this.masterGain!);

      noise.start();
      noise.onended = () => {
        gain.disconnect();
        bandpass.disconnect();
        resolve();
      };
    });
  }

  /**
   * Roger Beep & Courtesy Tone Generator
   */
  public async playRogerBeep(type: RogerBeepType): Promise<void> {
    if (type === 'none') return;
    this.initContext();

    switch (type) {
      case 'motorola_classic': {
        // Motorola double-tone: 885 Hz (45ms), brief pause, 1050 Hz (45ms)
        await this.playTone(885, 0.05, 'sine', 0.4);
        await new Promise((r) => setTimeout(r, 20));
        await this.playTone(1050, 0.06, 'sine', 0.4);
        break;
      }
      case 'kenwood_courtesy': {
        // Kenwood style: 1750 Hz short polite beep
        await this.playTone(1750, 0.075, 'sine', 0.35);
        break;
      }
      case 'nasa_quindar': {
        // NASA Apollo Quindar intro tone: 2525 Hz, 250ms
        await this.playTone(2525, 0.18, 'sine', 0.35);
        break;
      }
      case 'pistar_chime': {
        // Pi-Star digital chime: 660 Hz then 880 Hz
        await this.playTone(660, 0.08, 'sine', 0.35);
        await this.playTone(880, 0.12, 'sine', 0.35);
        break;
      }
      case 'dual_tone_burst': {
        // Simultaneous two-tone burst (1209 Hz + 697 Hz)
        const ctx = this.initContext();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        const gain2 = ctx.createGain();

        osc1.frequency.value = 1209;
        osc2.frequency.value = 697;
        gain1.gain.value = 0.25;
        gain2.gain.value = 0.25;

        osc1.connect(gain1);
        osc2.connect(gain2);
        gain1.connect(this.filterLow!);
        gain2.connect(this.filterLow!);

        const dur = 0.12;
        osc1.start(ctx.currentTime);
        osc2.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + dur);
        osc2.stop(ctx.currentTime + dur);
        await new Promise((r) => setTimeout(r, dur * 1000 + 20));
        break;
      }
      case 'soft_chirp': {
        // Soft chirp: 1200 Hz down to 800 Hz
        const ctx = this.initContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(750, ctx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

        osc.connect(gain);
        gain.connect(this.filterLow!);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
        await new Promise((r) => setTimeout(r, 90));
        break;
      }
    }
  }

  /**
   * Play Morse Code (CW ID Beacon)
   */
  public async playMorseBeacon(text: string, wpm = 18, toneHz = 750): Promise<void> {
    const morse = textToMorse(text);
    // Standard PARIS timing: dot duration = 1200 / wpm ms
    const dotMs = 1200 / wpm;
    const dashMs = dotMs * 3;

    for (const symbol of morse.split('')) {
      if (symbol === '.') {
        await this.playTone(toneHz, dotMs / 1000, 'sine', 0.4);
        await new Promise((r) => setTimeout(r, dotMs));
      } else if (symbol === '-') {
        await this.playTone(toneHz, dashMs / 1000, 'sine', 0.4);
        await new Promise((r) => setTimeout(r, dotMs));
      } else if (symbol === ' ') {
        // Space between letters: 3 dot durations (we already waited 1 dot duration)
        await new Promise((r) => setTimeout(r, dotMs * 2));
      }
    }
  }

  /**
   * Speak an alert notification through Web SpeechSynthesis with radio filtering and audio staging
   */
  public async speakVoiceAlert(text: string, settings: AudioSettings): Promise<void> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('SpeechSynthesis not supported in this environment');
      return;
    }

    this.initContext();

    // Key up mic click if enabled
    if (settings.micClickEnabled) {
      await this.playMicClick();
      await new Promise((r) => setTimeout(r, 40));
    }

    return new Promise((resolve) => {
      // Cancel any ongoing utterance if needed, or queue
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = settings.speechRate || 1.0;
      utterance.pitch = settings.speechPitch || 1.0;
      utterance.volume = Math.max(0, Math.min(1, settings.volume));

      // Match selected voice
      const voices = this.getVoices();
      if (settings.selectedVoiceURI) {
        const found = voices.find((v) => v.voiceURI === settings.selectedVoiceURI);
        if (found) utterance.voice = found;
      }

      utterance.onend = async () => {
        // Squelch tail burst at the end of radio transmission
        if (settings.squelchTailEnabled) {
          await this.playSquelchTail(settings.squelchTailDurationMs || 90);
        }
        resolve();
      };

      utterance.onerror = (e) => {
        console.warn('SpeechSynthesis error:', e);
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Execute full alert pipeline: Beep -> Speech -> Squelch
   */
  public async triggerNotification(
    text: string,
    settings: AudioSettings,
    rogerBeep: RogerBeepType = 'none'
  ): Promise<void> {
    // 1. Play roger beep / courtesy tone if specified
    if (rogerBeep && rogerBeep !== 'none') {
      await this.playRogerBeep(rogerBeep);
      await new Promise((r) => setTimeout(r, 60));
    }

    // 2. Play speech alert
    if (text && text.trim().length > 0) {
      await this.speakVoiceAlert(text, settings);
    }
  }

  public testCalibrationTone(freq = 1000): Promise<void> {
    return this.playTone(freq, 1.0, 'sine', 0.4);
  }
}

export const audioEngine = new AudioAlertEngine();
