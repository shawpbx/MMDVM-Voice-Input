import React from 'react';
import { Volume2, Radio } from 'lucide-react';

interface TopNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onQuickTest: () => void;
  isAudioReady: boolean;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  setActiveTab,
  onQuickTest,
  isAudioReady,
}) => {
  const navItems = [
    { id: 'dmr-inject', label: 'DMR TG Injector', highlight: true },
    { id: 'interface', label: 'Audio Interface' },
    { id: 'alerts', label: 'Voice Alert Matrix' },
    { id: 'monitor', label: 'Live Monitor & Logs' },
    { id: 'beeps', label: 'Roger Beeps & CW' },
    { id: 'config', label: 'MMDVM.ini & Daemon' },
  ];

  return (
    <header className="flex items-center justify-between gap-4 sm:gap-6 px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-2.5 shrink-0">
        <Radio className="w-5 h-5 text-amber-500" />
        <span className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap">
          MMDVM Audio Console
        </span>
      </div>

      {/* Zone 2: Clean single-line text navigation links */}
      <nav className="flex items-center gap-4 sm:gap-5 text-xs font-medium text-slate-400 overflow-x-auto pb-0.5 no-scrollbar">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? 'text-amber-400 border-amber-500 font-semibold'
                  : 'border-transparent hover:text-slate-200'
              } ${item.highlight && !isActive ? 'text-amber-300/90' : ''}`}
            >
              {item.highlight && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              )}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>


      {/* Zone 3: 1 primary action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onQuickTest}
          className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap shadow-sm cursor-pointer"
          title="Play sample voice alert through the selected audio interface"
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>Test Audio Out</span>
        </button>
      </div>
    </header>
  );
};
