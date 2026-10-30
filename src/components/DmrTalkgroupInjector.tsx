import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Radio,
  Volume2,
  VolumeX,
  Play,
  Square,
  Upload,
  AlertTriangle,
  RotateCcw,
  Zap,
  Sliders,
  Terminal,
  Activity,
  CheckCircle,
  FileAudio,
  Headphones,
  Settings2,
  Layers,
  ArrowRight,
  Info,
  Clock,
  Sparkles,
  HelpCircle,
  Hash,
} from 'lucide-react';
import {
  DmrCallType,
  DmrInjectionState,
  DmrPresetBulletin,
  DmrTargetTalkgroup,
  DmrTimeSlot,
  DmrTxMetrics,
  MmdvmStatus,
  AudioSettings,
} from '../types/mmdvm';
import { dmrAudioInjector, DmrInjectionConfig, MicPermissionStatus } from '../services/dmrAudioInjector';
import { audioEngine } from '../services/audioEngine';

interface DmrTalkgroupInjectorProps {
  status: MmdvmStatus;
  setStatus: React.Dispatch<React.SetStateAction<MmdvmStatus>>;
  settings: AudioSettings;
  addLog: (entry: { level: 'I' | 'M' | 'W' | 'E'; source: 'RF' | 'NET' | 'SYS'; message: string }) => void;
  onNavigateToConfig?: () => void;
}

const COMMON_TALKGROUPS: DmrTargetTalkgroup[] = [
  {
    tgId: 91,
    name: 'Worldwide',
    defaultSlot: 1,
    description: 'Global international DMR calling channel (BrandMeister / FreeDMR)',
    category: 'worldwide',
  },
  {
    tgId: 3100,
    name: 'USA Nationwide',
    defaultSlot: 1,
    description: 'United States nationwide main calling channel',
    category: 'national',
  },
  {
    tgId: 9,
    name: 'Local / Repeater',
    defaultSlot: 2,
    description: 'On-repeater and local cluster traffic',
    category: 'regional',
  },
  {
    tgId: 9990,
    name: 'Parrot (Echo Test)',
    defaultSlot: 1,
    description: 'Echo audio test server: bounces back recorded transmission to verify voice quality',
    category: 'test',
    isEcho: true,
  },
  {
    tgId: 310,
    name: 'TAC 310',
    defaultSlot: 1,
    description: 'North American tactical ragchew talkgroup',
    category: 'tactical',
  },
  {
    tgId: 235,
    name: 'UK Nationwide',
    defaultSlot: 1,
    description: 'United Kingdom DMR main channel',
    category: 'national',
  },
  {
    tgId: 262,
    name: 'Germany (DL)',
    defaultSlot: 1,
    description: 'German national talkgroup',
    category: 'national',
  },
  {
    tgId: 31099,
    name: 'Tactical Net',
    defaultSlot: 2,
    description: 'Emergency communications, Skywarn, and club nets',
    category: 'tactical',
  },
];

const PRESET_BULLETINS: DmrPresetBulletin[] = [
  {
    id: 'net_preamble',
    title: 'Weekly Amateur Radio Net Preamble',
    category: 'Club Net',
    description: 'Standard opening protocol calling stations for check-ins',
    text: 'Calling all amateur radio operators. This is the weekly digital voice net on DMR Talkgroup 31099. Net Control Station is now standing by for check-ins with or without traffic.',
  },
  {
    id: 'skywarn_warning',
    title: 'Skywarn Severe Weather Advisory',
    category: 'Emergency',
    description: 'Weather alert bulletin for tactical nets and repeaters',
    text: 'Priority Weather Announcement. The National Weather Service has issued a severe thunderstorm watch for our listening area until 2200 hours. All Skywarn spotters please stand by on this talkgroup.',
  },
  {
    id: 'repeater_id',
    title: 'Station Identification & Telemetry',
    category: 'Identification',
    description: 'Hourly ID with repeater telemetry and frequency info',
    text: 'This is repeater W 1 A W located in Newington Connecticut, operating on 438.800 megahertz with MMDVM digital voice and audio injection enabled.',
  },
  {
    id: 'emergency_breaker',
    title: 'Emergency Traffic Priority Notice',
    category: 'Emergency',
    description: 'Immediate channel clear notice for emergency priority traffic',
    text: 'Break break break! Please clear this DMR talkgroup immediately for priority emergency communications. All stations standby.',
  },
  {
    id: 'club_meeting',
    title: 'Club Meeting Announcement',
    category: 'Club Notice',
    description: 'Informational broadcast for local amateur radio club members',
    text: 'Amateur radio bulletin: The monthly club meeting will take place this Thursday at 1900 hours at the community center. All licensed operators are welcome.',
  },
];

export const DmrTalkgroupInjector: React.FC<DmrTalkgroupInjectorProps> = ({
  status,
  setStatus,
  settings,
  addLog,
  onNavigateToConfig,
}) => {
  // Config state
  const [selectedTg, setSelectedTg] = useState<number>(91);
  const [customTgInput, setCustomTgInput] = useState<string>('91');
  const [timeSlot, setTimeSlot] = useState<DmrTimeSlot>(1);
  const [callType, setCallType] = useState<DmrCallType>('group');
  const [colorCode, setColorCode] = useState<number>(1);
  const [sourceCallsign, setSourceCallsign] = useState<string>(status.repeaterCallsign || 'W1AW');
  const [sourceDmrId, setSourceDmrId] = useState<string>(status.dmrId || '3109999');
  const [micGain, setMicGain] = useState<number>(1.0);
  const [sidetoneVolume, setSidetoneVolume] = useState<number>(0.15);
  const [timeOutTimer, setTimeOutTimer] = useState<number>(60);
  const [enableParrotPlayback, setEnableParrotPlayback] = useState<boolean>(true);

  // Active Injection Mode tab
  const [activeModeTab, setActiveModeTab] = useState<'mic' | 'tts' | 'bulletins' | 'macros' | 'guide'>('mic');

  // Transmission state & metrics
  const [injectionState, setInjectionState] = useState<DmrInjectionState>('idle');
  const [metrics, setMetrics] = useState<DmrTxMetrics | null>(null);
  const [isPttLocked, setIsPttLocked] = useState<boolean>(false);
  const [permStatus, setPermStatus] = useState<MicPermissionStatus>({
    hasPermission: true,
    isDenied: false,
    isVirtualActive: false,
  });

  // TTS fields
  const [ttsText, setTtsText] = useState<string>(
    `Calling all stations on DMR Talkgroup 91. This is ${status.repeaterCallsign || 'W1AW'} conducting an audio interface broadcast test.`
  );
  const [ttsPhonetic, setTtsPhonetic] = useState<boolean>(settings.phoneticCallsigns);
  const [ttsSpeechRate, setTtsSpeechRate] = useState<number>(settings.speechRate || 1.0);
  const [ttsSpeechPitch, setTtsSpeechPitch] = useState<number>(settings.speechPitch || 1.0);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');

  // Audio file upload state
  const [uploadedFile, setUploadedFile] = useState<{ name: string; buffer: AudioBuffer; duration: number } | null>(null);
  const [isDecodingAudio, setIsDecodingAudio] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Visualizer canvas for DMR RF/Audio modulation
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load voices on mount
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      if (voices.length > 0 && !selectedVoiceURI) {
        setSelectedVoiceURI(voices[0].voiceURI);
      }
    };
    loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [selectedVoiceURI]);

  // Sync config with injector service
  useEffect(() => {
    dmrAudioInjector.setConfig({
      targetTG: selectedTg,
      timeSlot,
      callType,
      colorCode,
      sourceCallsign,
      sourceDmrId,
      micGain,
      sidetoneVolume,
      timeOutTimerSec: timeOutTimer,
      enableParrotPlayback,
    });
  }, [
    selectedTg,
    timeSlot,
    callType,
    colorCode,
    sourceCallsign,
    sourceDmrId,
    micGain,
    sidetoneVolume,
    timeOutTimer,
    enableParrotPlayback,
  ]);

  // Wire up injector listeners
  useEffect(() => {
    const unsubState = dmrAudioInjector.onStateChange((newState) => {
      setInjectionState(newState);
      if (newState === 'idle') {
        setIsPttLocked(false);
        setStatus((prev) => ({ ...prev, txState: 'IDLE' }));
      } else if (newState === 'transmitting') {
        setStatus((prev) => ({ ...prev, txState: 'TX', activeMode: 'DMR', currentTarget: `TG ${selectedTg}` }));
      }
    });

    const unsubMetrics = dmrAudioInjector.onMetrics((m) => {
      setMetrics(m);
    });

    const unsubLog = dmrAudioInjector.onLog((l) => {
      addLog(l);
    });

    const unsubPerm = dmrAudioInjector.onPermissionUpdate((p) => {
      setPermStatus(p);
    });

    return () => {
      unsubState();
      unsubMetrics();
      unsubLog();
      unsubPerm();
    };
  }, [addLog, selectedTg, setStatus]);

  const handleRetryMic = async () => {
    const success = await dmrAudioInjector.retryPhysicalMic();
    if (success) {
      addLog({
        level: 'I',
        source: 'SYS',
        message: 'Microphone permission granted. Switched to physical audio input.',
      });
    }
  };

  const handleToggleVirtualMic = (useVirtual: boolean) => {
    dmrAudioInjector.setUseVirtualMic(useVirtual);
  };

  // Real-time canvas visualizer loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = dmrAudioInjector.getAnalyser() || audioEngine.getAnalyser();
    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animId = requestAnimationFrame(render);
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, w, h);

      // Draw subtle grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      for (let y = 0; y < h; y += 16) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      if (analyser && injectionState === 'transmitting') {
        analyser.getByteFrequencyData(dataArray);
        const barWidth = (w / bufferLength) * 2;
        let x = 0;

        for (let i = 0; i < bufferLength / 2; i++) {
          const val = dataArray[i];
          const barH = (val / 255) * (h - 6);

          // Red-amber gradient during transmission (DMR vocoder hot band)
          const grad = ctx.createLinearGradient(0, h, 0, h - barH);
          grad.addColorStop(0, '#06b6d4');
          grad.addColorStop(0.6, '#f59e0b');
          grad.addColorStop(1, '#ef4444');

          ctx.fillStyle = grad;
          ctx.fillRect(x, h - barH, barWidth - 1, barH);
          x += barWidth;
        }
      } else if (injectionState === 'playback_echo') {
        // Cyan pulse wave during Parrot echo return
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const t = Date.now() / 150;
        for (let x = 0; x < w; x++) {
          const y = h / 2 + Math.sin(x * 0.05 + t) * 14;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        // Idle baseline line
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
      }
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [injectionState]);

  // Handle Talkgroup selection
  const handleSelectTg = (tg: DmrTargetTalkgroup) => {
    setSelectedTg(tg.tgId);
    setCustomTgInput(tg.tgId.toString());
    setTimeSlot(tg.defaultSlot);
  };

  const handleCustomTgChange = (val: string) => {
    setCustomTgInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 9999999) {
      setSelectedTg(parsed);
    }
  };

  // PTT Handlers
  const handlePttDown = async () => {
    if (injectionState === 'transmitting') return;
    await dmrAudioInjector.startMicTransmission();
  };

  const handlePttUp = async () => {
    if (!isPttLocked && injectionState === 'transmitting') {
      await dmrAudioInjector.stopMicTransmission();
    }
  };

  const handleTogglePttLock = async () => {
    if (injectionState === 'transmitting') {
      setIsPttLocked(false);
      await dmrAudioInjector.stopMicTransmission();
    } else {
      setIsPttLocked(true);
      await dmrAudioInjector.startMicTransmission();
    }
  };

  // Keyboard shortcut: Spacebar for PTT
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space' && activeModeTab === 'mic' && injectionState === 'idle') {
        e.preventDefault();
        handlePttDown();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space' && activeModeTab === 'mic' && !isPttLocked) {
        e.preventDefault();
        handlePttUp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeModeTab, injectionState, isPttLocked]);

  // TTS Broadcast
  const handleInjectTts = async () => {
    await dmrAudioInjector.injectTtsAnnouncement(ttsText, {
      speechRate: ttsSpeechRate,
      speechPitch: ttsSpeechPitch,
      phonetic: ttsPhonetic,
      voiceURI: selectedVoiceURI,
    });
  };

  const handlePreviewTtsLocally = async () => {
    await audioEngine.speakVoiceAlert(ttsText, {
      ...settings,
      speechRate: ttsSpeechRate,
      speechPitch: ttsSpeechPitch,
      phoneticCallsigns: ttsPhonetic,
      selectedVoiceURI: selectedVoiceURI,
    });
  };

  // Audio File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsDecodingAudio(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      setUploadedFile({
        name: file.name,
        buffer: audioBuffer,
        duration: audioBuffer.duration,
      });
      addLog({
        level: 'I',
        source: 'SYS',
        message: `Audio file loaded: "${file.name}" (${audioBuffer.duration.toFixed(1)}s, ${audioBuffer.sampleRate}Hz, ${audioBuffer.numberOfChannels}ch)`,
      });
    } catch (err) {
      console.error('Audio decode error:', err);
      addLog({
        level: 'E',
        source: 'SYS',
        message: `Failed to decode audio file "${file.name}": ${(err as Error).message}`,
      });
    } finally {
      setIsDecodingAudio(false);
    }
  };

  const handleStreamUploadedFile = async () => {
    if (!uploadedFile) return;
    await dmrAudioInjector.injectAudioBuffer(uploadedFile.buffer, uploadedFile.name);
  };

  // Preset Bulletin Broadcast
  const handleInjectPreset = async (bulletin: DmrPresetBulletin) => {
    setTtsText(bulletin.text);
    await dmrAudioInjector.injectTtsAnnouncement(bulletin.text, {
      speechRate: ttsSpeechRate,
      speechPitch: ttsSpeechPitch,
      phonetic: ttsPhonetic,
      voiceURI: selectedVoiceURI,
    });
  };

  // Calibration Tone Injection
  const handleInjectCalibrationTone = async (freq = 1000, duration = 3) => {
    await dmrAudioInjector.injectTestTone(freq, duration);
  };

  const activeTgObj = COMMON_TALKGROUPS.find((tg) => tg.tgId === selectedTg);

  return (
    <div className="space-y-6">
      {/* Top Banner: Active Talkgroup & DMR Channel Status Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
        {/* Glow accent */}
        <div
          className={`absolute top-0 left-0 right-0 h-1 transition-all duration-300 ${
            injectionState === 'transmitting'
              ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.8)]'
              : injectionState === 'playback_echo'
              ? 'bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.8)]'
              : 'bg-amber-500/50'
          }`}
        />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Channel Identification */}
          <div className="flex items-start gap-4">
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                injectionState === 'transmitting'
                  ? 'bg-rose-950/80 border-rose-500/80 text-rose-400 animate-pulse'
                  : injectionState === 'playback_echo'
                  ? 'bg-cyan-950/80 border-cyan-500/80 text-cyan-400 animate-pulse'
                  : 'bg-slate-950 border-slate-800 text-amber-400'
              }`}
            >
              <Radio className="w-7 h-7" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs uppercase font-mono tracking-wider text-slate-400 font-semibold">
                  DMR Talkgroup Audio Injector
                </span>
                <span className="text-slate-600">&bull;</span>
                <span
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                    injectionState === 'transmitting'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : injectionState === 'playback_echo'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {injectionState === 'transmitting'
                    ? '● TRANSMITTING AUDIO TO TG'
                    : injectionState === 'playback_echo'
                    ? '↻ PARROT ECHO PLAYBACK'
                    : '○ STANDBY (READY TO TRANSMIT)'}
                </span>
                {selectedTg === 9990 && (
                  <span className="text-[11px] font-mono bg-cyan-900/40 text-cyan-300 border border-cyan-700/50 px-2 py-0.5 rounded">
                    Parrot Echo Mode
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-3 mt-1">
                <h2 className="text-2xl font-black font-mono tracking-tight text-slate-100 flex items-center gap-2">
                  <span>TG {selectedTg}</span>
                  <span className="text-base font-medium text-slate-400">
                    ({activeTgObj ? activeTgObj.name : 'Custom Talkgroup'})
                  </span>
                </h2>
              </div>

              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                {activeTgObj ? activeTgObj.description : `Custom user-defined DMR Talkgroup ${selectedTg}`}
              </p>
            </div>
          </div>

          {/* Quick Telemetry Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/80 p-3.5 rounded-lg border border-slate-800 text-xs font-mono shrink-0">
            <div>
              <div className="text-slate-500 uppercase tracking-wider text-[10px]">Time Slot</div>
              <div className="text-amber-400 font-bold text-sm mt-0.5">Slot {timeSlot} (TS{timeSlot})</div>
            </div>
            <div>
              <div className="text-slate-500 uppercase tracking-wider text-[10px]">Source Radio</div>
              <div className="text-slate-200 font-semibold text-sm mt-0.5">{sourceCallsign}</div>
              <div className="text-[10px] text-slate-400">ID: {sourceDmrId}</div>
            </div>
            <div>
              <div className="text-slate-500 uppercase tracking-wider text-[10px]">Color Code</div>
              <div className="text-slate-200 font-semibold text-sm mt-0.5">CC {colorCode}</div>
            </div>
            <div>
              <div className="text-slate-500 uppercase tracking-wider text-[10px]">Call Type</div>
              <div className="text-slate-200 font-semibold text-sm mt-0.5 capitalize">{callType} Call</div>
            </div>
          </div>
        </div>

        {/* Target Talkgroup Quick Selector Buttons */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap mr-1">Talkgroups:</span>
            {COMMON_TALKGROUPS.map((tg) => {
              const isSelected = selectedTg === tg.tgId;
              return (
                <button
                  key={tg.tgId}
                  onClick={() => handleSelectTg(tg)}
                  className={`text-xs px-2.5 py-1.5 rounded-md font-mono transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 border ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-sm'
                      : 'bg-slate-800/70 text-slate-300 border-slate-700/60 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span>TG {tg.tgId}</span>
                  <span className={`text-[10px] ${isSelected ? 'text-slate-900 font-normal' : 'text-slate-400'}`}>
                    ({tg.name})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom TG & Time Slot selector */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-md px-2 py-1">
              <span className="text-[11px] font-mono text-slate-400">Custom TG:</span>
              <input
                type="number"
                value={customTgInput}
                onChange={(e) => handleCustomTgChange(e.target.value)}
                min="1"
                max="16776415"
                placeholder="e.g. 91"
                className="w-20 bg-transparent text-xs font-mono text-amber-300 focus:outline-none"
              />
            </div>

            {/* Time Slot Toggle */}
            <div className="flex items-center rounded-md border border-slate-800 bg-slate-950 p-0.5 text-xs font-mono">
              <button
                onClick={() => setTimeSlot(1)}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                  timeSlot === 1
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Time Slot 1 (Standard for Worldwide/National Talkgroups)"
              >
                TS 1
              </button>
              <button
                onClick={() => setTimeSlot(2)}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                  timeSlot === 2
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Time Slot 2 (Standard for Local Repeater/Cluster Talkgroups)"
              >
                TS 2
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Parrot Mode Alert Notice */}
      {selectedTg === 9990 && (
        <div className="bg-cyan-950/40 border border-cyan-800/60 rounded-xl p-4 flex items-start gap-3 text-cyan-200 text-xs">
          <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-cyan-300">DMR Audio Echo / Parrot Test (TG 9990) Active</p>
            <p className="text-cyan-200/80 leading-relaxed">
              In amateur radio DMR, Talkgroup 9990 is the automated audio loopback parrot server. Whenever you inject audio (via Microphone, TTS, or Audio File) into TG 9990, the server records your audio and automatically replays it back after 1.2 seconds. This enables you to audition exactly how your audio levels, frequency response, and voice clarity will sound across the DMR network!
            </p>
          </div>
        </div>
      )}

      {/* Main Grid: Left = Audio Injection Studio, Right = DMR Transmission Telemetry & Visualizer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 4 Injection Modes (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Mode Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-900/90 p-1.5 rounded-lg border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setActiveModeTab('mic')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md transition-colors cursor-pointer ${
                activeModeTab === 'mic'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Live Mic PTT</span>
            </button>

            <button
              onClick={() => setActiveModeTab('tts')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md transition-colors cursor-pointer ${
                activeModeTab === 'tts'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>TTS Announcer</span>
            </button>

            <button
              onClick={() => setActiveModeTab('bulletins')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md transition-colors cursor-pointer ${
                activeModeTab === 'bulletins'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileAudio className="w-3.5 h-3.5" />
              <span>Audio Files</span>
            </button>

            <button
              onClick={() => setActiveModeTab('macros')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md transition-colors cursor-pointer ${
                activeModeTab === 'macros'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Soundboard</span>
            </button>

            <button
              onClick={() => setActiveModeTab('guide')}
              className={`flex items-center justify-center gap-1 py-2 px-3 rounded-md transition-colors cursor-pointer ${
                activeModeTab === 'guide'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Linux / Pi-Star Hardware Audio Injection Architecture Guide"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Bridge Guide</span>
            </button>
          </div>

          {/* Mode 1: Live Mic PTT */}
          {activeModeTab === 'mic' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <Mic className="w-4 h-4 text-amber-500" />
                    <span>Live Push-To-Talk (PTT) Audio Injection</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Stream live audio from your microphone directly into DMR Talkgroup {selectedTg} on Time Slot {timeSlot}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Physical vs Virtual Mic Selector */}
                  <div className="flex items-center rounded-md border border-slate-800 bg-slate-950 p-0.5 text-xs font-mono">
                    <button
                      onClick={() => handleToggleVirtualMic(false)}
                      disabled={permStatus.isDenied}
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1 ${
                        !permStatus.isVirtualActive
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed'
                      }`}
                      title={permStatus.isDenied ? 'Microphone permission blocked in browser' : 'Use hardware microphone'}
                    >
                      <Mic className="w-3 h-3" />
                      <span>Physical Mic</span>
                    </button>
                    <button
                      onClick={() => handleToggleVirtualMic(true)}
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1 ${
                        permStatus.isVirtualActive
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Use simulated amateur radio test voice generator (no mic required)"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Virtual Voice</span>
                    </button>
                  </div>

                  <div className="text-[11px] font-mono text-slate-400 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded hidden sm:block">
                    Press <kbd className="bg-slate-800 px-1 py-0.5 rounded text-amber-400 font-bold">Spacebar</kbd>
                  </div>
                </div>
              </div>

              {/* Informative Banner when Browser Permission is restricted */}
              {permStatus.isDenied && (
                <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-3 text-xs flex items-start gap-2.5 text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-bold text-amber-300">
                        Microphone Blocked by Browser &ndash; Virtual Radio Mic Active
                      </span>
                      <button
                        onClick={handleRetryMic}
                        className="px-2.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-mono text-[10px] border border-amber-500/40 cursor-pointer transition-colors"
                      >
                        Retry Physical Mic
                      </button>
                    </div>
                    <p className="text-[11px] text-amber-200/80 leading-relaxed">
                      Your browser has restricted microphone access. The console has automatically activated the <strong>Virtual Radio Voice Simulator</strong> (generating a realistic voice check test pattern) so you can key PTT, test talkgroup audio injection, and verify Parrot echo without interruption.
                    </p>
                  </div>
                </div>
              )}

              {/* Big Interactive PTT Button */}
              <div className="flex flex-col items-center justify-center py-6 bg-slate-950/60 rounded-xl border border-slate-800/80">
                <button
                  onMouseDown={handlePttDown}
                  onMouseUp={handlePttUp}
                  onMouseLeave={handlePttUp}
                  className={`w-36 h-36 rounded-full flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xl select-none active:scale-95 ${
                    injectionState === 'transmitting'
                      ? 'bg-gradient-to-b from-rose-500 to-rose-700 text-white shadow-[0_0_40px_rgba(244,63,94,0.6)] ring-4 ring-rose-400/50 animate-pulse'
                      : 'bg-gradient-to-b from-slate-800 to-slate-900 text-slate-200 hover:from-slate-700 hover:to-slate-800 hover:text-white border-2 border-slate-700'
                  }`}
                >
                  {injectionState === 'transmitting' ? (
                    <>
                      <Radio className="w-9 h-9 animate-bounce" />
                      <span className="text-xs font-black tracking-wider uppercase font-mono">ON AIR (TX)</span>
                      <span className="text-[10px] font-mono opacity-80">
                        {permStatus.isVirtualActive ? 'Virtual Speech' : 'Mic Live'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-9 h-9 text-amber-400" />
                      <span className="text-xs font-bold tracking-wider uppercase font-mono">PUSH TO TALK</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {permStatus.isVirtualActive ? 'Virtual Voice' : 'Hardware Mic'}
                      </span>
                    </>
                  )}
                </button>

                {/* PTT Lock Toggle */}
                <div className="flex items-center gap-4 mt-5 text-xs font-mono">
                  <button
                    onClick={handleTogglePttLock}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border transition-colors cursor-pointer ${
                      isPttLocked
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-bold'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <span>{isPttLocked ? 'PTT Locked (Transmitting)' : 'Lock PTT (Hands-Free)'}</span>
                  </button>

                  {injectionState === 'transmitting' && (
                    <button
                      onClick={() => dmrAudioInjector.abortTransmission()}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer"
                    >
                      <Square className="w-3 h-3 text-rose-400" />
                      <span>Release (Unkey)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Audio Input Level & Vocoder Clipping Indicator */}
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">AMBE+2 Vocoder Input Level:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-bold">
                      {metrics ? `${metrics.audioPeakDb} dBFS` : '-60.0 dBFS'}
                    </span>
                    {metrics?.isClipping && (
                      <span className="bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] px-1.5 py-0.5 rounded font-bold animate-pulse">
                        VOC OVERMODULATION
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Bar VU Meter */}
                <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden flex p-0.5 border border-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      metrics?.isClipping
                        ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                        : metrics && metrics.audioPeakDb > -12
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                    style={{
                      width: `${metrics ? Math.min(100, Math.max(0, ((metrics.audioPeakDb + 60) / 60) * 100)) : 0}%`,
                    }}
                  />
                </div>

                <div className="flex justify-between text-[10px] font-mono text-slate-500 px-1">
                  <span>-60 dB (Silence)</span>
                  <span>-18 dB (Nominal DMR Audio)</span>
                  <span className="text-rose-400">-0 dB (AMBE Clipping)</span>
                </div>
              </div>

              {/* Input Controls: Gain & Sidetone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5 bg-slate-950 p-3.5 rounded-lg border border-slate-800">
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-400">Microphone Gain</span>
                    <span className="text-amber-400">{micGain.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="2.5"
                    step="0.1"
                    value={micGain}
                    onChange={(e) => setMicGain(parseFloat(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                  <p className="text-[10px] text-slate-500">
                    Adjust so voice peaks stay between -18 dB and -6 dBFS.
                  </p>
                </div>

                <div className="space-y-1.5 bg-slate-950 p-3.5 rounded-lg border border-slate-800">
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-400">Headphone Sidetone</span>
                    <span className="text-cyan-400">{Math.round(sidetoneVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="0.5"
                    step="0.05"
                    value={sidetoneVolume}
                    onChange={(e) => setSidetoneVolume(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                  <p className="text-[10px] text-slate-500">
                    Monitor your own transmission audio locally during PTT.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Mode 2: TTS Announcer */}
          {activeModeTab === 'tts' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-amber-500" />
                    <span>Text-to-Speech (TTS) Voice Injection</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Synthesize voice announcements and broadcast them straight into DMR Talkgroup {selectedTg}
                  </p>
                </div>
              </div>

              {/* Preset Announcement Pills */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-mono text-slate-400">Quick Templates:</span>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {PRESET_BULLETINS.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setTtsText(b.text)}
                      className="text-xs font-mono px-2.5 py-1 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 whitespace-nowrap cursor-pointer transition-colors"
                    >
                      {b.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Area */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono text-slate-400">
                  <span>Announcement Script:</span>
                  <span>{ttsText.length} characters</span>
                </div>
                <textarea
                  rows={4}
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  placeholder="Type voice announcement to broadcast into talkgroup..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 font-sans focus:outline-none focus:border-amber-500 leading-relaxed"
                />
              </div>

              {/* TTS Controls: Voice, Rate, Pitch, Phonetic */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                <div>
                  <label className="text-slate-400 block mb-1">Synthesizer Voice</label>
                  <select
                    value={selectedVoiceURI}
                    onChange={(e) => setSelectedVoiceURI(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500 truncate"
                  >
                    {availableVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded border border-slate-800">
                  <div>
                    <div className="text-slate-200 font-semibold">NATO Phonetic Spelling</div>
                    <div className="text-[10px] text-slate-500 font-sans">Spell callsigns as Alpha Bravo Charlie</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={ttsPhonetic}
                    onChange={(e) => setTtsPhonetic(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Speed Rate</span>
                    <span className="text-amber-400">{ttsSpeechRate.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.75"
                    max="1.5"
                    step="0.05"
                    value={ttsSpeechRate}
                    onChange={(e) => setTtsSpeechRate(parseFloat(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Pitch</span>
                    <span className="text-amber-400">{ttsSpeechPitch.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.3"
                    step="0.05"
                    value={ttsSpeechPitch}
                    onChange={(e) => setTtsSpeechPitch(parseFloat(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={handlePreviewTtsLocally}
                  disabled={injectionState === 'transmitting'}
                  className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Headphones className="w-3.5 h-3.5" />
                  <span>Audition Locally</span>
                </button>

                <button
                  onClick={handleInjectTts}
                  disabled={injectionState === 'transmitting' || !ttsText.trim()}
                  className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer flex items-center gap-2 shadow-sm"
                >
                  <Radio className="w-4 h-4" />
                  <span>Transmit to TG {selectedTg} (TS{timeSlot})</span>
                </button>
              </div>
            </div>
          )}

          {/* Mode 3: Pre-Recorded Audio Files & Bulletins */}
          {activeModeTab === 'bulletins' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <FileAudio className="w-4 h-4 text-amber-500" />
                  <span>DMR Audio File Streamer & Pre-recorded Bulletins</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Inject WAV, MP3, or pre-recorded audio bulletins directly into the DMR Talkgroup stream
                </p>
              </div>

              {/* Custom File Upload Box */}
              <div className="border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-xl p-5 bg-slate-950/50 text-center transition-colors">
                <input
                  type="file"
                  accept="audio/*"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-amber-400" />
                  <div className="text-xs text-slate-300 font-semibold">
                    {uploadedFile ? uploadedFile.name : 'Upload Audio File (WAV, MP3, OGG)'}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Audio will be bandpass-filtered to 300Hz-3.4kHz for standard DMR AMBE vocoder compatibility.
                  </p>

                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-1.5 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded cursor-pointer transition-colors"
                    >
                      Browse Audio File
                    </button>

                    {uploadedFile && (
                      <button
                        onClick={handleStreamUploadedFile}
                        disabled={injectionState === 'transmitting'}
                        className="px-4 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <Radio className="w-3.5 h-3.5" />
                        <span>Broadcast to TG {selectedTg} ({uploadedFile.duration.toFixed(1)}s)</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Built-in Bulletin Library */}
              <div className="space-y-3">
                <span className="text-xs font-mono text-slate-400 font-semibold block">
                  Built-in Radio Bulletins & Alignment Tones:
                </span>

                <div className="grid grid-cols-1 gap-2.5">
                  {PRESET_BULLETINS.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors"
                    >
                      <div className="space-y-0.5 max-w-md">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-200">{b.title}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-amber-400">
                            {b.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">{b.description}</p>
                      </div>

                      <button
                        onClick={() => handleInjectPreset(b)}
                        disabled={injectionState === 'transmitting'}
                        className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 rounded transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                      >
                        <Play className="w-3 h-3" />
                        <span>Transmit</span>
                      </button>
                    </div>
                  ))}

                  {/* 1000 Hz Alignment Tone */}
                  <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200">1000 Hz AMBE Alignment Tone (3 sec)</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-900/40 text-cyan-300">
                          Calibration
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Standard 0 dBFS reference tone to calibrate receiver deviation and audio sink levels
                      </p>
                    </div>

                    <button
                      onClick={() => handleInjectCalibrationTone(1000, 3)}
                      disabled={injectionState === 'transmitting'}
                      className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-cyan-400 hover:text-slate-950 text-slate-200 rounded transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      <Play className="w-3 h-3" />
                      <span>Transmit Tone</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mode 4: Soundboard & Quick Radio Macros */}
          {activeModeTab === 'macros' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span>DMR Voice Soundboard & Quick Macros</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Single-click canned voice broadcasts for net control operations and station announcements
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    title: 'Net In Progress - Standby',
                    text: 'The weekly amateur radio net is now in progress on this talkgroup. Please keep transmissions directed through Net Control.',
                  },
                  {
                    title: 'Channel Clear / Resume',
                    text: 'Net is concluded. This talkgroup is now clear for normal amateur radio traffic. Thank you to all stations.',
                  },
                  {
                    title: 'QST QST All Stations',
                    text: 'QST QST QST. Calling all stations for an informational bulletin regarding repeater maintenance.',
                  },
                  {
                    title: 'Radio Check 1 2 3',
                    text: `This is ${sourceCallsign} conducting a quick radio check and audio verification on DMR Talkgroup ${selectedTg}.`,
                  },
                  {
                    title: 'Station Identification',
                    text: `This is station ${sourceCallsign} monitoring DMR Talkgroup ${selectedTg} Time Slot ${timeSlot}.`,
                  },
                  {
                    title: 'Priority Breaker Standby',
                    text: 'Priority breaker acknowledged. Go ahead station with priority traffic.',
                  },
                ].map((macro, idx) => (
                  <button
                    key={idx}
                    onClick={() =>
                      dmrAudioInjector.injectTtsAnnouncement(macro.text, {
                        speechRate: ttsSpeechRate,
                        speechPitch: ttsSpeechPitch,
                        phonetic: ttsPhonetic,
                        voiceURI: selectedVoiceURI,
                      })
                    }
                    disabled={injectionState === 'transmitting'}
                    className="p-4 rounded-lg bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/50 text-left transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition-colors">
                        {macro.title}
                      </span>
                      <Radio className="w-3.5 h-3.5 text-slate-600 group-hover:text-amber-400" />
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{macro.text}</p>
                    <div className="mt-3 text-[10px] font-mono text-amber-500 flex items-center gap-1">
                      <span>Broadcast to TG {selectedTg}</span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mode 5: Hardware & Linux Setup Guide */}
          {activeModeTab === 'guide' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md space-y-5 text-xs text-slate-300">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-500" />
                  <span>How Audio Injection Works on Real MMDVM / Pi-Star Hardware</span>
                </h3>
              </div>

              <div className="space-y-4 leading-relaxed">
                <p>
                  To insert analog or digital PCM audio into a DMR Talkgroup on a physical Raspberry Pi running MMDVM-Host or Pi-Star, there are three industry-standard architectures:
                </p>

                {/* Method 1 */}
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-400 font-mono text-sm">
                    <span>1. Analog_Bridge + md380-emu (USRP Socket Audio Bridging)</span>
                  </div>
                  <p className="text-slate-400">
                    This is the gold-standard method developed by the DVSwitch and AllStarLink teams. An audio socket (USRP) receives PCM audio (from a script, microphone, or SIP line), passes it to <code>md380-emu</code> to encode into AMBE+2 DMR vocoder frames, and transmits it via <code>MMDVM_Bridge</code> to BrandMeister or TG {selectedTg}.
                  </p>
                  <pre className="bg-slate-900 p-2.5 rounded font-mono text-[11px] text-slate-300 overflow-x-auto">
                    sudo apt install git build-essential{'\n'}
                    git clone https://github.com/DVSwitch/Analog_Bridge.git{'\n'}
                    # Configure Analog_Bridge.ini for USRP Port 12345 to DMR TG {selectedTg}
                  </pre>
                </div>

                {/* Method 2 */}
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-cyan-400 font-mono text-sm">
                    <span>2. Homebrew Repeater Protocol (UDP Direct Injection)</span>
                  </div>
                  <p className="text-slate-400">
                    The DMR Homebrew protocol uses UDP port 62031 to send DMR data frames (Voice Header, Voice LC, Superframe, Term LC) directly to BrandMeister Master or FreeDMR servers.
                  </p>
                  <p className="text-slate-400">
                    You can export the ready-to-run <code>dmr_audio_injector.py</code> daemon script in the{' '}
                    <span className="text-amber-400 font-semibold cursor-pointer" onClick={onNavigateToConfig}>
                      MMDVM.ini & Daemon tab
                    </span>{' '}
                    to run this directly on your server.
                  </p>
                </div>

                {/* Method 3 */}
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-emerald-400 font-mono text-sm">
                    <span>3. Physical ALSA Audio Interface to Radio Mic Jack</span>
                  </div>
                  <p className="text-slate-400">
                    Connect your USB sound card (e.g., CM108 or C-Media dongle) to the repeater radio microphone/data input, with GPIO triggering PTT. When audio plays from this console, the radio keys up and transmits the FM or DMR carrier.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Real-time DMR TDMA Framing & Protocol Telemetry (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* RF / Audio Modulation Visualizer */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-amber-500" />
                <span>DMR RF Modulation Visualizer</span>
              </span>
              <span className="text-[11px] text-slate-500">
                {injectionState === 'transmitting'
                  ? 'TX BURST ACTIVE'
                  : injectionState === 'playback_echo'
                  ? 'PARROT ECHO RETURN'
                  : 'STANDBY'}
              </span>
            </div>

            {/* Canvas */}
            <div className="rounded-lg overflow-hidden border border-slate-800 bg-[#090d16]">
              <canvas
                ref={canvasRef}
                width={360}
                height={120}
                className="w-full h-28 block"
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span>9.6 kbps 4FSK Carrier</span>
              <span>AMBE+2 Vocoder Bandpass</span>
              <span>TDMA 30ms Slots</span>
            </div>
          </div>

          {/* DMR TDMA Transmission Telemetry Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md space-y-4">
            <h4 className="text-xs font-mono text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-amber-500" />
              <span>Real-Time DMR TDMA Framing</span>
            </h4>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-500 text-[10px] uppercase">AMBE+2 Frames</div>
                <div className="text-lg font-bold text-amber-400 mt-0.5">
                  {metrics ? metrics.framesSent : 0}
                </div>
                <div className="text-[10px] text-slate-500">~16.6 frames / sec</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-500 text-[10px] uppercase">Burst Duration</div>
                <div className="text-lg font-bold text-slate-100 mt-0.5">
                  {metrics ? `${metrics.durationSeconds}s` : '0.0s'}
                </div>
                <div className="text-[10px] text-slate-500">TOT: {timeOutTimer}s max</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-500 text-[10px] uppercase">RSSI Signal</div>
                <div className="text-base font-bold text-emerald-400 mt-0.5">
                  {metrics && injectionState === 'transmitting' ? `${metrics.currentRssi} dBm` : '-'}
                </div>
                <div className="text-[10px] text-slate-500">Signal Strength</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-500 text-[10px] uppercase">Bit Error Rate</div>
                <div className="text-base font-bold text-cyan-400 mt-0.5">
                  {metrics && injectionState === 'transmitting' ? `${metrics.currentBer}%` : '0.0%'}
                </div>
                <div className="text-[10px] text-slate-500">DMR 4FSK BER</div>
              </div>
            </div>

            {/* TDMA Burst Sequence Diagram */}
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
              <div className="text-[11px] font-mono text-slate-400 font-semibold">
                TDMA Timeslot Burst Sequence:
              </div>
              <div className="grid grid-cols-4 gap-1 text-[10px] font-mono text-center">
                <div
                  className={`p-1.5 rounded border transition-colors ${
                    injectionState === 'transmitting'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                      : 'bg-slate-900 text-slate-500 border-slate-800'
                  }`}
                >
                  Voice LC
                </div>
                <div
                  className={`p-1.5 rounded border transition-colors ${
                    injectionState === 'transmitting'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold animate-pulse'
                      : 'bg-slate-900 text-slate-500 border-slate-800'
                  }`}
                >
                  AMBE Slot {timeSlot}
                </div>
                <div className="p-1.5 rounded border bg-slate-900/50 text-slate-600 border-slate-800/80">
                  Guard (2.5ms)
                </div>
                <div
                  className={`p-1.5 rounded border transition-colors ${
                    injectionState === 'transmitting'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-slate-900 text-slate-500 border-slate-800'
                  }`}
                >
                  Term LC
                </div>
              </div>
            </div>

            {/* Quick Echo Test Button */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-200">Parrot Echo Test</div>
                <div className="text-[10px] text-slate-500">Test voice clarity on TG 9990</div>
              </div>

              <button
                onClick={() => {
                  setSelectedTg(9990);
                  setCustomTgInput('9990');
                  setTimeSlot(1);
                  dmrAudioInjector.injectTtsAnnouncement(
                    `Echo test from station ${sourceCallsign}. Verifying DMR audio injection modulation.`,
                    {
                      speechRate: ttsSpeechRate,
                      speechPitch: ttsSpeechPitch,
                      phonetic: ttsPhonetic,
                      voiceURI: selectedVoiceURI,
                    }
                  );
                }}
                disabled={injectionState === 'transmitting'}
                className="px-3 py-1.5 text-xs font-mono bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/60 rounded cursor-pointer transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Run Parrot Test</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
