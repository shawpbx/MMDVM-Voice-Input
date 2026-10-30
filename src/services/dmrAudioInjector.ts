import { DmrAudioSourceType, DmrCallType, DmrInjectionState, DmrTimeSlot, DmrTxMetrics } from '../types/mmdvm';
import { audioEngine } from './audioEngine';
import { callsignToPhonetic } from './phonetics';

export interface DmrInjectionConfig {
  targetTG: number;
  timeSlot: DmrTimeSlot;
  callType: DmrCallType;
  colorCode: number;
  sourceCallsign: string;
  sourceDmrId: string;
  micGain: number; // 0.1 - 2.5
  preEmphasisFilter: boolean;
  timeOutTimerSec: number; // e.g. 60s
  enableParrotPlayback: boolean;
  sidetoneVolume: number; // 0.0 - 0.5
  useVirtualMic?: boolean;
}

export interface MicPermissionStatus {
  hasPermission: boolean;
  isDenied: boolean;
  isVirtualActive: boolean;
  errorMessage?: string;
}

type MetricsCallback = (metrics: DmrTxMetrics) => void;
type StateCallback = (state: DmrInjectionState) => void;
type LogCallback = (log: { level: 'I' | 'M' | 'W' | 'E'; source: 'RF' | 'NET' | 'SYS'; message: string }) => void;
type PermissionCallback = (status: MicPermissionStatus) => void;

export class DmrAudioInjectorService {
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private virtualSourceNode: AudioBufferSourceNode | null = null;
  private micGainNode: GainNode | null = null;
  private bandpassFilter: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sidetoneGainNode: GainNode | null = null;
  private recordDestination: MediaStreamAudioDestinationNode | null = null;

  private state: DmrInjectionState = 'idle';
  private micPermissionDenied: boolean = false;
  private config: DmrInjectionConfig = {
    targetTG: 91,
    timeSlot: 1,
    callType: 'group',
    colorCode: 1,
    sourceCallsign: 'W1AW',
    sourceDmrId: '3109999',
    micGain: 1.0,
    preEmphasisFilter: true,
    timeOutTimerSec: 60,
    enableParrotPlayback: true,
    sidetoneVolume: 0.15,
    useVirtualMic: false,
  };

  private metricsListeners: Set<MetricsCallback> = new Set();
  private stateListeners: Set<StateCallback> = new Set();
  private logListeners: Set<LogCallback> = new Set();
  private permissionListeners: Set<PermissionCallback> = new Set();

  private txStartTime: number = 0;
  private framesSent: number = 0;
  private metricsInterval: number | null = null;
  private totTimer: number | null = null;

  // Recorded buffer for DMR Parrot (TG 9990)
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private echoAudioElement: HTMLAudioElement | null = null;

  // Active audio file / tone source nodes
  private activeBufferSource: AudioBufferSourceNode | null = null;
  private activeSpeechUtterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    // Initialized on user interaction
  }

  public setConfig(newConfig: Partial<DmrInjectionConfig>) {
    this.config = { ...this.config, ...newConfig };
    if (this.micGainNode && this.audioCtx && typeof newConfig.micGain === 'number') {
      this.micGainNode.gain.setValueAtTime(newConfig.micGain, this.audioCtx.currentTime);
    }
    if (this.sidetoneGainNode && this.audioCtx && typeof newConfig.sidetoneVolume === 'number') {
      this.sidetoneGainNode.gain.setValueAtTime(newConfig.sidetoneVolume, this.audioCtx.currentTime);
    }
  }

  public getConfig(): DmrInjectionConfig {
    return { ...this.config };
  }

  public getState(): DmrInjectionState {
    return this.state;
  }

  public onMetrics(callback: MetricsCallback): () => void {
    this.metricsListeners.add(callback);
    return () => this.metricsListeners.delete(callback);
  }

  public onStateChange(callback: StateCallback): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  public onLog(callback: LogCallback): () => void {
    this.logListeners.add(callback);
    return () => this.logListeners.delete(callback);
  }

  private setState(newState: DmrInjectionState) {
    this.state = newState;
    this.stateListeners.forEach((fn) => fn(newState));
  }

  private emitLog(level: 'I' | 'M' | 'W' | 'E', source: 'RF' | 'NET' | 'SYS', message: string) {
    this.logListeners.forEach((fn) => fn({ level, source, message }));
  }

  public onPermissionUpdate(callback: PermissionCallback): () => void {
    this.permissionListeners.add(callback);
    // Initial dispatch
    callback({
      hasPermission: !this.micPermissionDenied && !this.config.useVirtualMic,
      isDenied: this.micPermissionDenied,
      isVirtualActive: Boolean(this.config.useVirtualMic || this.micPermissionDenied),
    });
    return () => this.permissionListeners.delete(callback);
  }

  private emitPermissionUpdate(status: MicPermissionStatus) {
    this.permissionListeners.forEach((fn) => fn(status));
  }

  public isVirtualMicActive(): boolean {
    return Boolean(this.config.useVirtualMic || this.micPermissionDenied);
  }

  public isMicPermissionDenied(): boolean {
    return this.micPermissionDenied;
  }

  public setUseVirtualMic(use: boolean) {
    this.config.useVirtualMic = use;
    this.emitPermissionUpdate({
      hasPermission: !this.micPermissionDenied && !use,
      isDenied: this.micPermissionDenied,
      isVirtualActive: use,
    });
  }

  private initAudioPipeline(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();

      // Bandpass filter to match standard DMR AMBE+2 speech vocoder input (300Hz - 3400Hz)
      this.bandpassFilter = this.audioCtx.createBiquadFilter();
      this.bandpassFilter.type = 'bandpass';
      this.bandpassFilter.frequency.value = 1850;
      this.bandpassFilter.Q.value = 0.7;

      // Dynamics compressor / vocoder limiter to prevent clipping
      this.compressorNode = this.audioCtx.createDynamicsCompressor();
      this.compressorNode.threshold.value = -12;
      this.compressorNode.knee.value = 6;
      this.compressorNode.ratio.value = 8;
      this.compressorNode.attack.value = 0.003;
      this.compressorNode.release.value = 0.05;

      // Mic gain node
      this.micGainNode = this.audioCtx.createGain();
      this.micGainNode.gain.value = this.config.micGain;

      // Analyser node for live VU meter & vocoder level calculation
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.6;

      // Sidetone gain node (so the operator can optionally hear their transmission in headphones)
      this.sidetoneGainNode = this.audioCtx.createGain();
      this.sidetoneGainNode.gain.value = this.config.sidetoneVolume;

      // Media stream destination for recording Parrot Echo (works for both physical mic & virtual voice)
      this.recordDestination = this.audioCtx.createMediaStreamDestination();

      // Wire nodes: Source -> MicGain -> Bandpass -> Compressor -> Analyser -> Sidetone -> Destination
      this.bandpassFilter.connect(this.compressorNode);
      this.compressorNode.connect(this.analyserNode);
      this.compressorNode.connect(this.recordDestination);
      this.analyserNode.connect(this.sidetoneGainNode);
      this.sidetoneGainNode.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    return this.audioCtx;
  }

  /**
   * Synthesize a realistic modulated radio voice test audio buffer
   * Simulates amateur radio voice transmission: "W1AW audio check 1 2 3 on DMR"
   */
  private createVirtualVoiceBuffer(ctx: AudioContext): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const duration = 4.0; // 4 second speech pattern loop
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;

      // Syllabic envelope: 6 syllables with speech pauses
      const syllablePhase = (t * 1.5) % 1;
      const syllableEnvelope = Math.sin(syllablePhase * Math.PI);
      const isWordActive = syllableEnvelope > 0.08 ? syllableEnvelope : 0.015;

      // Voice pitch intonation (145Hz to 165Hz)
      const pitch = 148 + Math.sin(t * 3.5) * 14;
      const fundamental = Math.sin(2 * Math.PI * pitch * t);

      // Formants simulating vowel resonance (F1: 720Hz, F2: 1350Hz, F3: 2400Hz)
      const f1 = Math.sin(2 * Math.PI * 720 * t) * 0.45;
      const f2 = Math.sin(2 * Math.PI * 1350 * t) * 0.35;
      const f3 = Math.sin(2 * Math.PI * 2400 * t) * 0.2;

      // Unvoiced breath noise
      const noise = (Math.random() * 2 - 1) * 0.07;

      data[i] = (fundamental * 0.5 + f1 + f2 + f3 + noise) * isWordActive * 0.45;
    }

    return buffer;
  }

  private startParrotRecorderIfNeeded() {
    if (
      this.config.targetTG === 9990 &&
      this.config.enableParrotPlayback &&
      this.recordDestination &&
      typeof MediaRecorder !== 'undefined'
    ) {
      this.recordedChunks = [];
      try {
        this.mediaRecorder = new MediaRecorder(this.recordDestination.stream);
        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) this.recordedChunks.push(e.data);
        };
        this.mediaRecorder.start();
      } catch (e) {
        console.warn('Parrot MediaRecorder setup failed:', e);
      }
    }
  }

  private startVirtualMicTransmission(): boolean {
    const ctx = this.initAudioPipeline();
    const voiceBuffer = this.createVirtualVoiceBuffer(ctx);

    const source = ctx.createBufferSource();
    source.buffer = voiceBuffer;
    source.loop = true;

    source.connect(this.micGainNode!);
    this.micGainNode!.connect(this.bandpassFilter!);
    this.virtualSourceNode = source;

    this.startParrotRecorderIfNeeded();
    this.beginTransmission('mic');
    source.start();

    return true;
  }

  /**
   * Start microphone capture and inject into Talkgroup (PTT Key Down)
   * With automatic fallback to Virtual Radio Mic if permission is denied
   */
  public async startMicTransmission(): Promise<boolean> {
    if (this.state === 'transmitting') return true;

    const ctx = this.initAudioPipeline();

    // If virtual mic mode was requested or previously selected
    if (this.config.useVirtualMic) {
      return this.startVirtualMicTransmission();
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia not supported in this browser context');
      }

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });

      this.micSourceNode = ctx.createMediaStreamSource(this.micStream);
      this.micSourceNode.connect(this.micGainNode!);
      this.micGainNode!.connect(this.bandpassFilter!);

      this.micPermissionDenied = false;
      this.emitPermissionUpdate({
        hasPermission: true,
        isDenied: false,
        isVirtualActive: false,
      });

      this.startParrotRecorderIfNeeded();
      this.beginTransmission('mic');
      return true;
    } catch (err) {
      const errMsg = (err as Error).message || '';
      console.info('Microphone unavailable or blocked, activating Virtual Radio Mic simulator:', errMsg);

      this.micPermissionDenied = true;
      this.config.useVirtualMic = true;

      this.emitPermissionUpdate({
        hasPermission: false,
        isDenied: true,
        isVirtualActive: true,
        errorMessage: errMsg.includes('Permission') ? 'Microphone permission blocked by browser' : errMsg,
      });

      this.emitLog(
        'I',
        'SYS',
        `Microphone permission blocked. Automatically activated Virtual Radio Mic Simulator (Synthesized Radio Speech) for DMR transmission.`
      );

      return this.startVirtualMicTransmission();
    }
  }

  /**
   * Retry requesting physical microphone permission
   */
  public async retryPhysicalMic(): Promise<boolean> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      this.micPermissionDenied = false;
      this.config.useVirtualMic = false;
      this.emitPermissionUpdate({
        hasPermission: true,
        isDenied: false,
        isVirtualActive: false,
      });
      this.emitLog('I', 'SYS', 'Physical microphone access granted.');
      return true;
    } catch (err) {
      this.micPermissionDenied = true;
      this.config.useVirtualMic = true;
      this.emitPermissionUpdate({
        hasPermission: false,
        isDenied: true,
        isVirtualActive: true,
        errorMessage: (err as Error).message,
      });
      return false;
    }
  }

  /**
   * Release microphone PTT (PTT Key Up)
   */
  public async stopMicTransmission(): Promise<void> {
    if (this.state !== 'transmitting') return;

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // Ignored
      }
    }

    if (this.virtualSourceNode) {
      try {
        this.virtualSourceNode.stop();
        this.virtualSourceNode.disconnect();
      } catch {
        // Ignored
      }
      this.virtualSourceNode = null;
    }

    // Stop and disconnect mic track
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.micSourceNode) {
      this.micSourceNode.disconnect();
      this.micSourceNode = null;
    }

    await this.endTransmission();
  }

  /**
   * Inject Text-To-Speech announcement into DMR Talkgroup
   */
  public async injectTtsAnnouncement(
    text: string,
    options: {
      speechRate?: number;
      speechPitch?: number;
      phonetic?: boolean;
      voiceURI?: string;
    } = {}
  ): Promise<void> {
    if (this.state === 'transmitting') return;
    if (!text || text.trim().length === 0) return;

    this.initAudioPipeline();

    const processedText = options.phonetic ? callsignToPhonetic(text) : text;

    this.beginTransmission('tts');
    this.emitLog(
      'M',
      'NET',
      `DMR Slot ${this.config.timeSlot}: TTS Voice Injection starting -> TG ${this.config.targetTG} ("${processedText.slice(0, 40)}...")`
    );

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(processedText);
      utterance.rate = options.speechRate || 1.0;
      utterance.pitch = options.speechPitch || 1.0;
      utterance.volume = 1.0;

      if (options.voiceURI) {
        const voices = window.speechSynthesis.getVoices();
        const v = voices.find((item) => item.voiceURI === options.voiceURI);
        if (v) utterance.voice = v;
      }

      this.activeSpeechUtterance = utterance;

      utterance.onend = async () => {
        this.activeSpeechUtterance = null;
        await this.endTransmission();
        resolve();
      };

      utterance.onerror = async (err) => {
        console.warn('TTS DMR Injection error:', err);
        this.activeSpeechUtterance = null;
        await this.endTransmission();
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Inject pre-recorded audio file (WAV / MP3) into DMR Talkgroup
   */
  public async injectAudioBuffer(buffer: AudioBuffer, label: string = 'Audio File'): Promise<void> {
    if (this.state === 'transmitting') return;
    const ctx = this.initAudioPipeline();

    this.beginTransmission('audio_file');
    this.emitLog(
      'M',
      'NET',
      `DMR Slot ${this.config.timeSlot}: Streaming Audio Broadcast "${label}" (${buffer.duration.toFixed(1)}s) to TG ${this.config.targetTG}`
    );

    return new Promise((resolve) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.bandpassFilter!);

      this.activeBufferSource = source;

      source.onended = async () => {
        this.activeBufferSource = null;
        await this.endTransmission();
        resolve();
      };

      source.start();
    });
  }

  /**
   * Inject pure tone or test alignment pattern (e.g. 1000 Hz 0dB AMBE alignment)
   */
  public async injectTestTone(frequency = 1000, durationSec = 3.0): Promise<void> {
    if (this.state === 'transmitting') return;
    const ctx = this.initAudioPipeline();

    this.beginTransmission('tone');
    this.emitLog(
      'I',
      'NET',
      `DMR Slot ${this.config.timeSlot}: Injecting ${frequency} Hz Vocoder Alignment Tone (${durationSec}s) into TG ${this.config.targetTG}`
    );

    return new Promise((resolve) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);

      gain.gain.setValueAtTime(0.5, ctx.currentTime);

      osc.connect(gain);
      gain.connect(this.bandpassFilter!);

      this.activeBufferSource = osc as unknown as AudioBufferSourceNode;

      osc.start();
      osc.stop(ctx.currentTime + durationSec);

      osc.onended = async () => {
        this.activeBufferSource = null;
        await this.endTransmission();
        resolve();
      };
    });
  }

  /**
   * Abort any ongoing transmission immediately
   */
  public abortTransmission(): void {
    if (this.activeBufferSource) {
      try {
        this.activeBufferSource.stop();
      } catch {
        // Ignored
      }
      this.activeBufferSource = null;
    }

    if (this.activeSpeechUtterance) {
      window.speechSynthesis.cancel();
      this.activeSpeechUtterance = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }

    if (this.totTimer) {
      clearTimeout(this.totTimer);
      this.totTimer = null;
    }

    this.endTransmission();
  }

  private beginTransmission(sourceType: DmrAudioSourceType) {
    this.setState('transmitting');
    this.txStartTime = Date.now();
    this.framesSent = 0;

    // DMR Preamble / Voice LC Log
    this.emitLog(
      'I',
      'NET',
      `DMR Slot ${this.config.timeSlot}: TX START [Voice LC Header] Target: TG ${this.config.targetTG} (${this.config.callType.toUpperCase()}) | Source: ${this.config.sourceCallsign} (ID: ${this.config.sourceDmrId}) | CC: ${this.config.colorCode}`
    );

    // Audio PTT click sound
    audioEngine.playMicClick();

    // Start Metrics calculation loop
    if (this.metricsInterval) clearInterval(this.metricsInterval);
    this.metricsInterval = window.setInterval(() => {
      this.calculateMetrics();
    }, 100);

    // Time-Out Timer protection
    if (this.config.timeOutTimerSec > 0) {
      if (this.totTimer) clearTimeout(this.totTimer);
      this.totTimer = window.setTimeout(() => {
        this.emitLog('W', 'SYS', `DMR Time-Out Timer (${this.config.timeOutTimerSec}s) EXPIRED! PTT automatically released.`);
        this.abortTransmission();
      }, this.config.timeOutTimerSec * 1000);
    }
  }

  private async endTransmission(): Promise<void> {
    if (this.totTimer) {
      clearTimeout(this.totTimer);
      this.totTimer = null;
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    const duration = ((Date.now() - this.txStartTime) / 1000).toFixed(1);

    // DMR Terminator LC
    this.emitLog(
      'I',
      'NET',
      `DMR Slot ${this.config.timeSlot}: TX END [Terminator LC] ${this.framesSent} AMBE+2 frames sent, duration: ${duration}s to TG ${this.config.targetTG}`
    );

    // Play DMR squelch tail / roger beep
    await audioEngine.playRogerBeep('motorola_classic');

    // Check if this was a transmission to TG 9990 (DMR Parrot Echo)
    if (this.config.targetTG === 9990 && this.config.enableParrotPlayback && this.recordedChunks.length > 0) {
      this.playParrotEcho();
    } else {
      this.setState('idle');
    }
  }

  /**
   * Simulate DMR Parrot (TG 9990) Network Return Echo
   */
  private playParrotEcho() {
    this.setState('playback_echo');
    this.emitLog(
      'M',
      'NET',
      `DMR Slot ${this.config.timeSlot}: [PARROT ECHO TG 9990] BrandMeister server recorded audio, echoing back to receiver...`
    );

    setTimeout(() => {
      if (this.recordedChunks.length === 0) {
        this.setState('idle');
        return;
      }

      const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
      const audioUrl = URL.createObjectURL(blob);

      if (this.echoAudioElement) {
        this.echoAudioElement.pause();
      }

      this.echoAudioElement = new Audio(audioUrl);
      this.echoAudioElement.onplay = () => {
        audioEngine.playMicClick();
      };
      this.echoAudioElement.onended = () => {
        audioEngine.playRogerBeep('pistar_chime');
        URL.revokeObjectURL(audioUrl);
        this.recordedChunks = [];
        this.setState('idle');
        this.emitLog('I', 'NET', 'DMR Slot 1: Parrot echo playback complete.');
      };
      this.echoAudioElement.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        this.recordedChunks = [];
        this.setState('idle');
      };

      this.echoAudioElement.play().catch((err) => {
        console.warn('Parrot playback error:', err);
        this.setState('idle');
      });
    }, 1200); // 1.2 second standard BrandMeister parrot turnaround delay
  }

  private calculateMetrics() {
    if (!this.analyserNode) return;

    // DMR TDMA uses 60ms frames (approx 16.6 frames per sec)
    const elapsedSec = (Date.now() - this.txStartTime) / 1000;
    this.framesSent = Math.floor(elapsedSec * 16.66);

    const buffer = new Float32Array(this.analyserNode.fftSize);
    this.analyserNode.getFloatTimeDomainData(buffer);

    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const abs = Math.abs(buffer[i]);
      if (abs > peak) peak = abs;
    }

    // Convert to dBFS
    const db = peak > 0.0001 ? 20 * Math.log10(peak) : -60;
    const clampedDb = Math.max(-60, Math.min(0, db));
    const isClipping = clampedDb > -1.5; // AMBE vocoder clips above -1.5 dBFS

    // Simulated RF metrics
    const currentRssi = Math.round(-65 + (Math.random() * 4 - 2));
    const currentBer = Number((0.15 + (isClipping ? 1.2 : 0.05) * Math.random()).toFixed(2));

    const metrics: DmrTxMetrics = {
      framesSent: this.framesSent,
      durationSeconds: Number(elapsedSec.toFixed(1)),
      currentRssi,
      currentBer,
      targetTG: this.config.targetTG,
      timeSlot: this.config.timeSlot,
      callType: this.config.callType,
      sourceCallsign: this.config.sourceCallsign,
      sourceDmrId: this.config.sourceDmrId,
      audioPeakDb: Number(clampedDb.toFixed(1)),
      isClipping,
    };

    this.metricsListeners.forEach((fn) => fn(metrics));
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }
}

export const dmrAudioInjector = new DmrAudioInjectorService();
