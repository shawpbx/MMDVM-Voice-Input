import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Radio,
  Wifi,
  AlertTriangle,
  Play,
  RotateCcw,
  CheckCircle,
  Clock,
  Terminal,
  Volume2,
  Sliders,
} from 'lucide-react';
import {
  DigitalMode,
  MmdvmLogEntry,
  MmdvmStatus,
  AudioSettings,
  AlertRule,
} from '../types/mmdvm';
import { audioEngine } from '../services/audioEngine';
import { callsignToPhonetic } from '../services/phonetics';

interface LiveConsoleProps {
  status: MmdvmStatus;
  setStatus: React.Dispatch<React.SetStateAction<MmdvmStatus>>;
  logs: MmdvmLogEntry[];
  addLog: (entry: Omit<MmdvmLogEntry, 'id' | 'timestamp'>) => void;
  settings: AudioSettings;
  rules: AlertRule[];
}

export const LiveConsole: React.FC<LiveConsoleProps> = ({
  status,
  setStatus,
  logs,
  addLog,
  settings,
  rules,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visualizerMode, setVisualizerMode] = useState<'spectrum' | 'waveform'>('spectrum');
  const [isSimulating, setIsSimulating] = useState(false);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Real-time canvas visualizer loop
  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = audioEngine.getAnalyser();
    const bufferLength = analyser ? analyser.frequencyBinCount : 256;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameId = requestAnimationFrame(render);
      if (!ctx || !canvas) return;

      const width = canvas.width;
      const height = canvas.height;

      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, width, height);

      // Draw subtle grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let y = 0; y < height; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      if (analyser) {
        if (visualizerMode === 'spectrum') {
          analyser.getByteFrequencyData(dataArray);
          const barWidth = (width / (bufferLength / 2)) * 1.5;
          let x = 0;

          for (let i = 0; i < bufferLength / 2; i++) {
            const barHeight = (dataArray[i] / 255) * (height - 10);

            // Gradient for radio telemetry aesthetic (cyan to amber)
            const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
            gradient.addColorStop(0, '#06b6d4'); // laser cyan
            gradient.addColorStop(0.7, '#38bdf8');
            gradient.addColorStop(1, '#f59e0b'); // amber peak

            ctx.fillStyle = gradient;
            ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);

            x += barWidth;
          }
        } else {
          // Waveform oscilloscope mode
          analyser.getByteTimeDomainData(dataArray);
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#06b6d4';
          ctx.beginPath();

          const sliceWidth = width / bufferLength;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * height) / 2;

            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
            x += sliceWidth;
          }
          ctx.stroke();
        }
      } else {
        // Idle flat line
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
      }
    };

    render();
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [visualizerMode]);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Execute an alert based on configured rules
  const dispatchAlert = async (ruleId: string, params: Record<string, string>) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule || !rule.enabled) return;

    let text = rule.voiceTemplate;
    for (const [key, value] of Object.entries(params)) {
      text = text.replace(new RegExp(`{${key}}`, 'g'), value);
    }

    if (rule.id === 'cw_id') {
      await audioEngine.playMorseBeacon(
        `DE ${status.repeaterCallsign}/R`,
        settings.cwSpeedWpm,
        settings.cwToneHz
      );
    } else {
      await audioEngine.triggerNotification(text, settings, rule.beepType || 'none');
    }
  };

  // Simulation handler 1: RF Incoming Transmission
  const simulateRfTransmission = async () => {
    setIsSimulating(true);
    const callsign = 'K1ABC';
    const tg = 'TG 91';
    const spokenCall = settings.phoneticCallsigns ? callsignToPhonetic(callsign) : callsign;

    setStatus((prev) => ({
      ...prev,
      txState: 'RX_RF',
      currentCallsign: callsign,
      currentTarget: tg,
      activeMode: 'DMR',
      currentBer: 0.4,
    }));

    addLog({
      level: 'M',
      source: 'RF',
      mode: 'DMR',
      callsign,
      target: tg,
      message: `DMR, received RF header from ${callsign} to ${tg}`,
    });

    await dispatchAlert('rf_rx_start', {
      callsign: spokenCall,
      talkgroup: tg,
      mode: 'DMR',
    });

    // Hold transmission for 2.5 seconds
    await new Promise((r) => setTimeout(r, 2500));

    setStatus((prev) => ({
      ...prev,
      txState: 'IDLE',
      currentCallsign: undefined,
      currentTarget: undefined,
      currentBer: 0.1,
    }));

    addLog({
      level: 'M',
      source: 'RF',
      mode: 'DMR',
      callsign,
      duration: 2.8,
      ber: 0.4,
      message: `DMR, received RF end of transmission, 2.8 seconds, BER: 0.4%`,
    });

    await dispatchAlert('rf_rx_end', {
      callsign: spokenCall,
      mode: 'DMR',
    });

    setIsSimulating(false);
  };

  // Simulation handler 2: High Bit Error Rate
  const simulateHighBer = async () => {
    setIsSimulating(true);
    const highBer = 3.6;

    setStatus((prev) => ({
      ...prev,
      currentBer: highBer,
    }));

    addLog({
      level: 'W',
      source: 'MODEM',
      mode: 'DMR',
      ber: highBer,
      message: `DMR, RF voice frame corrupted, BER threshold exceeded: ${highBer}%`,
    });

    await dispatchAlert('high_ber', {
      ber: highBer.toFixed(1),
    });

    setTimeout(() => {
      setStatus((prev) => ({ ...prev, currentBer: 0.2 }));
      setIsSimulating(false);
    }, 1500);
  };

  // Simulation handler 3: Mode change to YSF
  const simulateModeChange = async (mode: DigitalMode) => {
    setIsSimulating(true);
    setStatus((prev) => ({ ...prev, activeMode: mode }));

    addLog({
      level: 'I',
      source: 'MODEM',
      mode,
      message: `${mode} mode activated on modem interface`,
    });

    await dispatchAlert('mode_change', { mode });
    setIsSimulating(false);
  };

  // Simulation handler 4: Hourly ID Beacon
  const simulateHourlyId = async () => {
    setIsSimulating(true);
    const timeStr = new Date().toUTCString().slice(17, 22).replace(':', '');

    addLog({
      level: 'I',
      source: 'SYS',
      message: `Periodic Station Voice ID triggered: ${status.repeaterCallsign} at ${timeStr} UTC`,
    });

    await dispatchAlert('hourly_id', {
      callsign: settings.phoneticCallsigns
        ? callsignToPhonetic(status.repeaterCallsign)
        : status.repeaterCallsign,
      time: timeStr,
    });

    setIsSimulating(false);
  };

  // Simulation handler 5: Morse CW Beacon
  const simulateCwBeacon = async () => {
    setIsSimulating(true);
    addLog({
      level: 'I',
      source: 'SYS',
      message: `CW Station Beacon transmitting: DE ${status.repeaterCallsign}/R at ${settings.cwSpeedWpm} WPM`,
    });

    await dispatchAlert('cw_id', {});
    setIsSimulating(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Telemetry & Visualizer Ribbon */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Real-time Audio Spectrum & Oscilloscope Output */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-semibold text-slate-100">
                Connected Interface Audio Visualizer (Output Feed)
              </h3>
            </div>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800">
              <button
                onClick={() => setVisualizerMode('spectrum')}
                className={`px-2.5 py-1 text-[11px] rounded transition-colors cursor-pointer ${
                  visualizerMode === 'spectrum'
                    ? 'bg-slate-800 text-cyan-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Spectrum RTA
              </button>
              <button
                onClick={() => setVisualizerMode('waveform')}
                className={`px-2.5 py-1 text-[11px] rounded transition-colors cursor-pointer ${
                  visualizerMode === 'waveform'
                    ? 'bg-slate-800 text-cyan-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Oscilloscope
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div className="mt-3 relative bg-[#090d16] rounded border border-slate-800/80 overflow-hidden h-36">
            <canvas
              ref={canvasRef}
              width={640}
              height={144}
              className="w-full h-full block"
            />
            {/* Overlay coordinate markings */}
            <div className="absolute top-2 left-2 text-[10px] font-mono text-cyan-400/80 bg-slate-950/70 px-1.5 py-0.5 rounded">
              {visualizerMode === 'spectrum' ? 'FREQ: 20Hz - 20kHz' : 'OSCILLOSCOPE: TIME DOMAIN'}
            </div>
            <div className="absolute top-2 right-2 text-[10px] font-mono text-slate-400 bg-slate-950/70 px-1.5 py-0.5 rounded">
              SINK: {settings.selectedDeviceId === 'default' ? 'SYSTEM DEFAULT' : 'USB INTERFACE'}
            </div>
          </div>

          {/* Audio Telemetry Footer */}
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-3 pt-2 border-t border-slate-800/80">
            <span>Filter: {settings.radioFilterEnabled ? '300-3200 Hz Bandpass' : 'Wideband Flat'}</span>
            <span aria-hidden="true">·</span>
            <span>PTT Click: {settings.micClickEnabled ? 'ON' : 'OFF'}</span>
            <span aria-hidden="true">·</span>
            <span>Squelch: {settings.squelchTailEnabled ? `${settings.squelchTailDurationMs}ms` : 'OFF'}</span>
            <span aria-hidden="true">·</span>
            <span>Master Gain: {Math.round(settings.volume * 100)}%</span>
          </div>
        </div>

        {/* Right Col: MMDVM Host Modem State */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4 space-y-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-amber-400" />
              Modem Telemetry
            </span>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
              ONLINE
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
              <span className="text-slate-400">Repeater Callsign:</span>
              <span className="font-mono font-semibold text-slate-200">
                {status.repeaterCallsign}
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
              <span className="text-slate-400">DMR Radio ID:</span>
              <span className="font-mono text-slate-200">{status.dmrId}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
              <span className="text-slate-400">Active Mode:</span>
              <span className="font-mono font-semibold text-amber-400">
                {status.activeMode}
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
              <span className="text-slate-400">Traffic State:</span>
              <span
                className={`font-mono font-semibold ${
                  status.txState !== 'IDLE' ? 'text-cyan-400 animate-pulse' : 'text-slate-400'
                }`}
              >
                {status.txState}
                {status.currentCallsign && ` (${status.currentCallsign})`}
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
              <span className="text-slate-400">Bit Error Rate (BER):</span>
              <span
                className={`font-mono tabular-nums font-semibold ${
                  status.currentBer > 2.0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {status.currentBer.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-400">Modem Temperature:</span>
              <span className="font-mono tabular-nums text-slate-200">
                {status.temperatureC.toFixed(1)} &deg;C
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Event Simulator Buttons */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-400" />
              Event Simulator & Audio Output Trigger
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Simulate live MMDVM events to test voice announcements, phonetic spelling, and roger beeps on your connected interface
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-4">
          <button
            onClick={simulateRfTransmission}
            disabled={isSimulating}
            className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-md text-left transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200 group-hover:text-amber-400">
              <span>RF Call</span>
              <Play className="w-3 h-3 text-slate-500 group-hover:text-amber-400" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              K1ABC &rarr; TG 91
            </p>
          </button>

          <button
            onClick={simulateHighBer}
            disabled={isSimulating}
            className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-md text-left transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200 group-hover:text-rose-400">
              <span>High BER</span>
              <AlertTriangle className="w-3 h-3 text-slate-500 group-hover:text-rose-400" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Warning: 3.6%
            </p>
          </button>

          <button
            onClick={() => simulateModeChange('YSF')}
            disabled={isSimulating}
            className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-md text-left transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200 group-hover:text-cyan-400">
              <span>YSF Switch</span>
              <Play className="w-3 h-3 text-slate-500 group-hover:text-cyan-400" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Fusion Room Link
            </p>
          </button>

          <button
            onClick={() => simulateModeChange('P25')}
            disabled={isSimulating}
            className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-md text-left transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200 group-hover:text-cyan-400">
              <span>P25 Switch</span>
              <Play className="w-3 h-3 text-slate-500 group-hover:text-cyan-400" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              NAC 293 Active
            </p>
          </button>

          <button
            onClick={simulateHourlyId}
            disabled={isSimulating}
            className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-md text-left transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200 group-hover:text-emerald-400">
              <span>Hourly ID</span>
              <Clock className="w-3 h-3 text-slate-500 group-hover:text-emerald-400" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Voice Time Mark
            </p>
          </button>

          <button
            onClick={simulateCwBeacon}
            disabled={isSimulating}
            className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-md text-left transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200 group-hover:text-amber-400">
              <span>Morse CW</span>
              <Play className="w-3 h-3 text-slate-500 group-hover:text-amber-400" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              DE {status.repeaterCallsign}/R
            </p>
          </button>
        </div>
      </div>

      {/* MMDVMHost Authentic Log Console */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs">
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800 text-slate-400">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-slate-300">
              MMDVMHost Log Stream (G4KLX Standard Format)
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            {logs.length} entries · auto-scroll active
          </span>
        </div>

        <div
          ref={logContainerRef}
          className="h-56 overflow-y-auto space-y-1 pr-2 scrollbar-thin scrollbar-thumb-slate-800"
        >
          {logs.map((log) => {
            let levelColor = 'text-slate-300';
            if (log.level === 'W') levelColor = 'text-amber-400 font-semibold';
            if (log.level === 'E') levelColor = 'text-rose-400 font-semibold';
            if (log.level === 'I') levelColor = 'text-cyan-400';

            return (
              <div key={log.id} className="leading-relaxed whitespace-pre-wrap break-all">
                <span className="text-slate-500">{log.timestamp}</span>{' '}
                <span className="text-slate-400">[{log.source}]</span>{' '}
                <span className={levelColor}>{log.message}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
