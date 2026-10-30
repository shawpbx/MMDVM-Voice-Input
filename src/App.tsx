import React, { useState, useEffect, useCallback } from 'react';
import {
  AudioDevice,
  AudioSettings,
  AlertRule,
  MmdvmStatus,
  MmdvmLogEntry,
} from './types/mmdvm';
import { audioEngine } from './services/audioEngine';
import { DEFAULT_ALERT_RULES } from './services/defaultAlertRules';
import { TopNav } from './components/TopNav';
import { AudioDeviceManager } from './components/AudioDeviceManager';
import { VoiceAlertMatrix } from './components/VoiceAlertMatrix';
import { LiveConsole } from './components/LiveConsole';
import { RogerBeepDesigner } from './components/RogerBeepDesigner';
import { ConfigExporter } from './components/ConfigExporter';
import { DmrTalkgroupInjector } from './components/DmrTalkgroupInjector';
import { Volume2, Radio, CheckCircle, Wifi, Shield } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dmr-inject');
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [isAudioReady, setIsAudioReady] = useState<boolean>(false);

  // Audio settings
  const [settings, setSettings] = useState<AudioSettings>({
    selectedDeviceId: 'default',
    volume: 0.8,
    radioFilterEnabled: true,
    squelchTailEnabled: true,
    squelchTailDurationMs: 90,
    micClickEnabled: true,
    speechRate: 1.0,
    speechPitch: 1.0,
    phoneticCallsigns: true,
    selectedVoiceURI: '',
    cwSpeedWpm: 18,
    cwToneHz: 750,
  });

  // Alert rules
  const [rules, setRules] = useState<AlertRule[]>(DEFAULT_ALERT_RULES);

  // MMDVM Status
  const [status, setStatus] = useState<MmdvmStatus>({
    connected: true,
    port: '/dev/ttyACM0',
    baudRate: 115200,
    activeMode: 'DMR',
    txState: 'IDLE',
    currentBer: 0.2,
    temperatureC: 43.8,
    rxFrequency: '438.800000',
    txFrequency: '431.200000',
    repeaterCallsign: 'W1AW',
    dmrId: '3109999',
    connectedAudioDeviceName: 'Default System Interface',
  });

  // MMDVM Log stream
  const [logs, setLogs] = useState<MmdvmLogEntry[]>([
    {
      id: 'log-1',
      timestamp: '2026-10-30 15:00:01.002',
      level: 'I',
      source: 'SYS',
      message: 'MMDVMHost-20261030 is starting, build git-g4klx',
    },
    {
      id: 'log-2',
      timestamp: '2026-10-30 15:00:01.045',
      level: 'I',
      source: 'SYS',
      message: 'Loaded configuration from /etc/mmdvmhost/MMDVM.ini',
    },
    {
      id: 'log-3',
      timestamp: '2026-10-30 15:00:01.120',
      level: 'M',
      source: 'MODEM',
      message: 'Opening port /dev/ttyACM0 at 115200 baud',
    },
    {
      id: 'log-4',
      timestamp: '2026-10-30 15:00:01.480',
      level: 'I',
      source: 'MODEM',
      message: 'MMDVM protocol version 1, description: MMDVM_HS_Hat-v1.5.2',
    },
    {
      id: 'log-5',
      timestamp: '2026-10-30 15:00:02.100',
      level: 'I',
      source: 'NET',
      mode: 'DMR',
      message: 'DMR, Master connection established to 162.248.241.94:62031 (BrandMeister 3102)',
    },
    {
      id: 'log-6',
      timestamp: '2026-10-30 15:00:02.340',
      level: 'I',
      source: 'SYS',
      message: 'Audio alert subsystem bound to connected audio interface [hw:1,0 CM108 / Default]',
    },
  ]);

  const addLog = useCallback(
    (entry: Omit<MmdvmLogEntry, 'id' | 'timestamp'>) => {
      const now = new Date();
      const pad = (n: number, s = 2) => n.toString().padStart(s, '0');
      const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
        now.getDate()
      )} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(
        now.getSeconds()
      )}.${pad(now.getMilliseconds(), 3)}`;

      const newEntry: MmdvmLogEntry = {
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp,
        ...entry,
      };

      setLogs((prev) => [...prev.slice(-150), newEntry]);
    },
    []
  );

  // Scan available audio output interfaces
  const refreshDevices = useCallback(async () => {
    const list = await audioEngine.getAvailableOutputDevices();
    setDevices(list);
    if (list.length > 0 && settings.selectedDeviceId === 'default') {
      const activeDev = list[0];
      setStatus((prev) => ({
        ...prev,
        connectedAudioDeviceName: activeDev.label,
      }));
    }
  }, [settings.selectedDeviceId]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // Update audio engine settings whenever state changes
  useEffect(() => {
    audioEngine.updateSettings(settings);
  }, [settings]);

  // Quick test button in header
  const handleQuickTest = async () => {
    setIsAudioReady(true);
    addLog({
      level: 'I',
      source: 'SYS',
      message: 'Audio interface test triggered: Playing voice status notification & roger beep',
    });
    await audioEngine.triggerNotification(
      'MMDVM audio interface operational. All systems nominal.',
      settings,
      'motorola_classic'
    );
  };

  return (
    <div className="min-h-screen bg-[#0c0f17] text-slate-100 flex flex-col font-sans selection:bg-amber-500/30">
      {/* Top Bar strictly following Top Bar Contract */}
      <TopNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onQuickTest={handleQuickTest}
        isAudioReady={isAudioReady}
      />

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* Secondary Subtitle / Context Ribbon */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800/80">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100">
              MMDVM DMR Audio Console & Talkgroup Streamer
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Live microphone PTT, text-to-speech bulletins, and audio streaming into DMR Talkgroups with AMBE+2 vocoder processing
            </p>
          </div>

          {/* Quick Status Badges */}
          <div className="flex items-center gap-3 text-xs font-mono text-slate-400 shrink-0">
            <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
              <span className={`w-2 h-2 rounded-full ${status.txState === 'TX' ? 'bg-rose-500 animate-pulse' : 'bg-emerald-400'}`}></span>
              <span>Modem: {status.port} {status.txState === 'TX' ? '(TX ACTIVE)' : ''}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span>Sink: {settings.selectedDeviceId === 'default' ? 'Default' : 'Selected USB'}</span>
            </div>
          </div>
        </div>

        {/* Tab 0: DMR Talkgroup Audio Injector */}
        {activeTab === 'dmr-inject' && (
          <DmrTalkgroupInjector
            status={status}
            setStatus={setStatus}
            settings={settings}
            addLog={addLog}
            onNavigateToConfig={() => setActiveTab('config')}
          />
        )}

        {/* Tab 1: Audio Interface Manager */}
        {activeTab === 'interface' && (
          <AudioDeviceManager
            settings={settings}
            setSettings={setSettings}
            devices={devices}
            refreshDevices={refreshDevices}
            onTriggerTestAlert={handleQuickTest}
          />
        )}

        {/* Tab 2: Voice Alert Matrix */}
        {activeTab === 'alerts' && (
          <VoiceAlertMatrix
            rules={rules}
            setRules={setRules}
            settings={settings}
            repeaterCallsign={status.repeaterCallsign}
          />
        )}

        {/* Tab 3: Live Monitor & Logs */}
        {activeTab === 'monitor' && (
          <LiveConsole
            status={status}
            setStatus={setStatus}
            logs={logs}
            addLog={addLog}
            settings={settings}
            rules={rules}
          />
        )}

        {/* Tab 4: Roger Beeps & CW */}
        {activeTab === 'beeps' && (
          <RogerBeepDesigner
            settings={settings}
            setSettings={setSettings}
            repeaterCallsign={status.repeaterCallsign}
          />
        )}

        {/* Tab 5: MMDVM.ini & Companion Daemon */}
        {activeTab === 'config' && (
          <ConfigExporter
            status={status}
            settings={settings}
            rules={rules}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 px-6 py-4 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>MMDVM-Host Audio Interface Subsystem</span>
            <span aria-hidden="true">·</span>
            <a
              href="https://github.com/g4klx/MMDVM-Host"
              target="_blank"
              rel="noreferrer noopener"
              className="text-amber-500 hover:text-amber-400 transition-colors"
            >
              Jonathan Naylor G4KLX MMDVM-Host GitHub
            </a>
          </div>
          <div>Web Audio API &middot; SpeechSynthesis &middot; ALSA hw:1,0 Routing</div>
        </div>
      </footer>
    </div>
  );
}
