import React, { useState } from 'react';
import {
  FileText,
  Copy,
  Download,
  Check,
  Code2,
  HardDrive,
  Cpu,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { AlertRule, AudioSettings, MmdvmStatus } from '../types/mmdvm';
import {
  generateMmdvmIni,
  generatePythonDaemonScript,
  generateAnalogBridgeConfig,
  generateDmrAudioInjectorPy,
} from '../services/configGenerator';

interface ConfigExporterProps {
  status: MmdvmStatus;
  settings: AudioSettings;
  rules: AlertRule[];
}

export const ConfigExporter: React.FC<ConfigExporterProps> = ({
  status,
  settings,
  rules,
}) => {
  const [activeTab, setActiveTab] = useState<
    'ini' | 'analog_bridge' | 'dmr_script' | 'python' | 'systemd' | 'hardware'
  >('analog_bridge');
  const [copied, setCopied] = useState<string | null>(null);

  const mmdvmIniContent = generateMmdvmIni(status, settings, rules);
  const pythonScriptContent = generatePythonDaemonScript(status, settings);
  const analogBridgeContent = generateAnalogBridgeConfig(status, 91, 1);
  const dmrAudioInjectorPyContent = generateDmrAudioInjectorPy(status, 91, 1);

  const systemdServiceContent = `[Unit]
Description=MMDVM Audio Interface Voice Alert Daemon
After=network.target mmdvmhost.service
Requires=mmdvmhost.service

[Service]
Type=simple
User=root
ExecStart=/usr/bin/python3 /opt/mmdvm_audio_alert/mmdvm_audio_alert.py --alsa-device hw:1,0
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`;

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      console.warn('Clipboard write failed:', e);
    }
  };

  const downloadFile = (content: string, filename: string, mimeType = 'text/plain') => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              Configuration & Hardware Integration
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Export MMDVM.ini configuration directives, Linux ALSA daemon scripts, and audio interface wiring guides
            </p>
          </div>

          {/* Tab selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg shrink-0 overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab('analog_bridge')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'analog_bridge'
                  ? 'bg-slate-800 text-amber-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Analog_Bridge.ini (DMR TG Bridge)
            </button>
            <button
              onClick={() => setActiveTab('dmr_script')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'dmr_script'
                  ? 'bg-slate-800 text-amber-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              dmr_audio_injector.py
            </button>
            <button
              onClick={() => setActiveTab('ini')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'ini'
                  ? 'bg-slate-800 text-amber-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              MMDVM.ini
            </button>
            <button
              onClick={() => setActiveTab('python')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'python'
                  ? 'bg-slate-800 text-amber-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Python ALSA Daemon
            </button>
            <button
              onClick={() => setActiveTab('systemd')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'systemd'
                  ? 'bg-slate-800 text-amber-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Systemd Service
            </button>
            <button
              onClick={() => setActiveTab('hardware')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'hardware'
                  ? 'bg-slate-800 text-amber-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Hardware & Wiring
            </button>
          </div>
        </div>

        {/* Tab Content: Analog_Bridge.ini */}
        {activeTab === 'analog_bridge' && (
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Path on Linux / Pi-Star: <code className="text-amber-400 font-mono">/opt/Analog_Bridge/Analog_Bridge.ini</code></span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(analogBridgeContent, 'ab')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors cursor-pointer"
                >
                  {copied === 'ab' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied === 'ab' ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  onClick={() => downloadFile(analogBridgeContent, 'Analog_Bridge.ini')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Analog_Bridge.ini</span>
                </button>
              </div>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded text-xs text-slate-300 leading-relaxed">
              <span className="text-amber-400 font-semibold font-mono">DMR Audio Injection Bridge:</span> This configuration connects a local USRP PCM audio socket (port 12345) to the AMBE+2 vocoder emulator (md380-emu), allowing real-time injection of any microphone, WAV file, or TTS announcement into DMR Talkgroups.
            </div>

            <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto max-h-[460px] leading-relaxed">
              {analogBridgeContent}
            </pre>
          </div>
        )}

        {/* Tab Content: dmr_audio_injector.py */}
        {activeTab === 'dmr_script' && (
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Standalone Python Audio Streamer: <code className="text-amber-400 font-mono">/usr/local/bin/dmr_audio_injector.py</code></span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(dmrAudioInjectorPyContent, 'dmr_py')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors cursor-pointer"
                >
                  {copied === 'dmr_py' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied === 'dmr_py' ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  onClick={() => downloadFile(dmrAudioInjectorPyContent, 'dmr_audio_injector.py', 'text/x-python')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Script</span>
                </button>
              </div>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded text-xs text-slate-300 space-y-1">
              <div className="text-cyan-400 font-semibold font-mono">CLI Command Line Examples:</div>
              <div className="font-mono text-[11px] text-slate-400">
                # Broadcast voice alert into Worldwide Talkgroup 91:{'\n'}
                python3 dmr_audio_injector.py --tg 91 --slot 1 --voice "Attention all stations, emergency weather net starting now."{'\n\n'}
                # Broadcast audio WAV bulletin into Talkgroup 3100:{'\n'}
                python3 dmr_audio_injector.py --tg 3100 --slot 1 --file club_bulletin.wav
              </div>
            </div>

            <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto max-h-[460px] leading-relaxed">
              {dmrAudioInjectorPyContent}
            </pre>
          </div>
        )}

        {/* Tab Content 1: MMDVM.ini */}
        {activeTab === 'ini' && (
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Path on Linux / Pi-Star: <code className="text-amber-400 font-mono">/etc/mmdvmhost/MMDVM.ini</code></span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(mmdvmIniContent, 'ini')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors cursor-pointer"
                >
                  {copied === 'ini' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied === 'ini' ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  onClick={() => downloadFile(mmdvmIniContent, 'MMDVM.ini')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download MMDVM.ini</span>
                </button>
              </div>
            </div>

            <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto max-h-[460px] leading-relaxed">
              {mmdvmIniContent}
            </pre>
          </div>
        )}

        {/* Tab Content 2: Python Script */}
        {activeTab === 'python' && (
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Standalone Linux Voice Alert Monitor Script: <code className="text-amber-400 font-mono">mmdvm_audio_alert.py</code></span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(pythonScriptContent, 'py')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors cursor-pointer"
                >
                  {copied === 'py' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied === 'py' ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  onClick={() => downloadFile(pythonScriptContent, 'mmdvm_audio_alert.py', 'text/x-python')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Script</span>
                </button>
              </div>
            </div>

            <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto max-h-[460px] leading-relaxed">
              {pythonScriptContent}
            </pre>
          </div>
        )}

        {/* Tab Content 3: Systemd Unit */}
        {activeTab === 'systemd' && (
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Install to: <code className="text-amber-400 font-mono">/etc/systemd/system/mmdvm-audio-alert.service</code></span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(systemdServiceContent, 'systemd')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors cursor-pointer"
                >
                  {copied === 'systemd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied === 'systemd' ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  onClick={() => downloadFile(systemdServiceContent, 'mmdvm-audio-alert.service')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Service</span>
                </button>
              </div>
            </div>

            <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto max-h-[460px] leading-relaxed">
              {systemdServiceContent}
            </pre>
          </div>
        )}

        {/* Tab Content 4: Hardware & Audio Interface Guide */}
        {activeTab === 'hardware' && (
          <div className="pt-4 space-y-5 text-xs text-slate-300 leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-2">
                <span className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-amber-400" />
                  Recommended Audio Interfaces
                </span>
                <ul className="list-disc pl-4 space-y-1.5 text-slate-400">
                  <li>
                    <strong className="text-slate-200">CM108 / C-Media USB Audio Fob:</strong> The standard in amateur radio repeater audio interfaces (RA-35, URIx, Rim-Lite, DINAH). Low latency with hardware GPIO PTT line if needed.
                  </li>
                  <li>
                    <strong className="text-slate-200">USB Stereo DAC / Sound Blaster:</strong> Plugs directly into Raspberry Pi or PC USB port; 3.5mm line out routes directly to the repeater audio mixer or local monitoring speaker.
                  </li>
                  <li>
                    <strong className="text-slate-200">Raspberry Pi 3.5mm Audio Jack:</strong> Standard PWM audio output mapped to ALSA <code className="text-amber-400 font-mono">hw:0,0</code>.
                  </li>
                </ul>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-2">
                <span className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  Linux ALSA Device Configuration
                </span>
                <div className="font-mono text-[11px] bg-slate-900/90 p-2.5 rounded border border-slate-800 space-y-1">
                  <p className="text-slate-500"># 1. Identify soundcard index and card number:</p>
                  <p className="text-cyan-400">aplay -l</p>
                  <p className="text-slate-500"># 2. Adjust output volume with ALSA mixer:</p>
                  <p className="text-cyan-400">alsamixer -c 1</p>
                  <p className="text-slate-500"># 3. Test direct audio playback through interface:</p>
                  <p className="text-cyan-400">speaker-test -D hw:1,0 -c 2 -t wav</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-3">
              <span className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-400" />
                Repeater Audio Injection Topology
              </span>
              <p className="text-slate-400">
                In a typical repeater or hotspot installation, digital voice packets are handled by MMDVMHost over the modem serial connection (RF board). By deploying this audio interface voice alert subsystem, the host PC or Raspberry Pi simultaneously routes synthesized voice announcements and roger beeps out of the secondary sound card (e.g. CM108 Line Out), which is tied into the repeater&rsquo;s auxiliary audio input, courtesy tone bus, or local monitor amplifier.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
