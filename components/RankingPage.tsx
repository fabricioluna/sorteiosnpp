import React, { useState, useEffect } from 'react';
import { Player } from '../types';
import { db } from '../utils/database';

type Tab = 'titles' | 'goals' | 'cards';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'titles', label: 'Títulos', icon: 'fa-trophy' },
  { id: 'goals', label: 'Gols', icon: 'fa-futbol' },
  { id: 'cards', label: 'Cartões', icon: 'fa-square' },
];

const medalColor = (idx: number) => {
  if (idx === 0) return 'text-yellow-400';
  if (idx === 1) return 'text-slate-300';
  if (idx === 2) return 'text-orange-600';
  return 'text-slate-600';
};

const RankingPage: React.FC = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('titles');

  useEffect(() => {
    db.getAllPlayers().then(all => {
      setPlayers(all);
      setIsLoading(false);
    });
  }, []);

  const statValue = (p: Player) => {
    if (tab === 'titles') return p.titles ?? 0;
    if (tab === 'goals') return p.goals ?? 0;
    return (p.yellowCards ?? 0) + (p.redCards ?? 0);
  };

  const ranked = [...players]
    .filter(p => statValue(p) > 0)
    .sort((a, b) => statValue(b) - statValue(a));

  return (
    <div className="animate-in fade-in duration-300 pb-12">
      <div className="text-center py-6">
        <h2 className="text-2xl font-black text-white uppercase italic">Ranking</h2>
        <p className="text-slate-400 text-sm mt-1">Títulos, gols e cartões acumulados nas peladas.</p>
      </div>

      <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800 mb-6 max-w-md mx-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wide transition-colors ${tab === t.id ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <i className={`fa-solid ${t.icon}`}></i> {t.label}
          </button>
        ))}
      </div>

      <div className="max-w-md mx-auto">
        {isLoading ? (
          <div className="text-center text-slate-500 py-12"><i className="fa-solid fa-spinner fa-spin text-3xl"></i></div>
        ) : ranked.length === 0 ? (
          <div className="text-center text-slate-500 py-12">
            <i className="fa-solid fa-chart-simple text-4xl mb-3 block"></i>
            Ainda não há dados suficientes nessa categoria.
          </div>
        ) : (
          <div className="space-y-2">
            {ranked.map((p, idx) => (
              <div key={p.id} className="bg-slate-900 rounded-xl border border-slate-800 p-3 flex items-center gap-3">
                <span className={`font-black text-lg w-7 text-center flex-none ${medalColor(idx)}`}>
                  {idx < 3 ? <i className="fa-solid fa-medal"></i> : idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white truncate">{p.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono">#{p.code}</div>
                </div>
                <div className="flex-none">
                  {tab === 'cards' ? (
                    <div className="flex items-center gap-2 font-black text-lg">
                      <span className="text-yellow-400">{p.yellowCards ?? 0}</span>
                      <span className="text-red-400">{p.redCards ?? 0}</span>
                    </div>
                  ) : (
                    <span className="font-black text-xl text-orange-400">{statValue(p)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RankingPage;
