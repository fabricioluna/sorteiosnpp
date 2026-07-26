import React, { useState } from 'react';
import { Pelada, PeladaPlayerResult } from '../types';
import { peladasDb } from '../utils/peladas';

interface PeladaEditorProps {
  pelada: Pelada;
  onBack: () => void;
  onSaved: () => void;
}

type ResultsMap = Record<string, Pick<PeladaPlayerResult, 'goals' | 'yellowCards' | 'redCards'>>;

const formatDate = (date: string) => date.split('-').reverse().join('/');

const PeladaEditor: React.FC<PeladaEditorProps> = ({ pelada, onBack, onSaved }) => {
  const [championTeamId, setChampionTeamId] = useState<number | undefined>(pelada.championTeamId);
  const [results, setResults] = useState<ResultsMap>(() => {
    const initial: ResultsMap = {};
    pelada.teams.forEach(t => t.players.forEach(p => {
      initial[p.playerId] = { goals: p.goals, yellowCards: p.yellowCards, redCards: p.redCards };
    }));
    return initial;
  });
  const [isSaving, setIsSaving] = useState(false);

  const updateResult = (playerId: string, field: keyof ResultsMap[string], value: number) => {
    setResults(prev => ({
      ...prev,
      [playerId]: { ...prev[playerId], [field]: Math.max(0, value) },
    }));
  };

  const handleSave = async () => {
    if (!championTeamId) {
      alert('Selecione o time campeão antes de salvar.');
      return;
    }
    setIsSaving(true);
    try {
      await peladasDb.saveResult(pelada.date, championTeamId, results);
      onSaved();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="animate-in slide-in-from-right duration-300">
      <div className="flex justify-between items-center mb-6">
        <div>
          <button onClick={onBack} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-700 mb-3">
            <i className="fa-solid fa-arrow-left mr-2"></i> Voltar
          </button>
          <h2 className="text-2xl font-black text-white italic">Pelada de {formatDate(pelada.date)}</h2>
          <span className={`inline-flex items-center gap-1.5 mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${pelada.status === 'concluída' ? 'text-green-400 border-green-500/40 bg-green-500/10' : 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10'}`}>
            {pelada.status}
          </span>
        </div>
      </div>

      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 mb-6 shadow-xl">
        <h3 className="text-yellow-400 font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
          <i className="fa-solid fa-trophy"></i> Time Campeão
        </h3>
        <div className="flex flex-wrap gap-2">
          {pelada.teams.map(t => (
            <button
              key={t.id}
              onClick={() => setChampionTeamId(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${championTeamId === t.id ? 'bg-yellow-500 text-slate-950 border-yellow-500' : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-yellow-500/50'}`}
            >
              {championTeamId === t.id && <i className="fa-solid fa-crown mr-1.5"></i>}
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {pelada.teams.map(t => (
          <div key={t.id} className={`bg-slate-900 rounded-2xl border overflow-hidden shadow-xl ${championTeamId === t.id ? 'border-yellow-500 ring-2 ring-yellow-500/20' : 'border-slate-800'}`}>
            <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center gap-2">
              {championTeamId === t.id && <i className="fa-solid fa-crown text-yellow-500"></i>}
              <h4 className="font-black text-white uppercase italic tracking-wide">{t.name}</h4>
            </div>
            <div className="divide-y divide-slate-800">
              {t.players.map(p => {
                const r = results[p.playerId] ?? { goals: 0, yellowCards: 0, redCards: 0 };
                return (
                  <div key={p.playerId} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-white text-sm truncate">{p.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">#{p.code}</div>
                    </div>
                    <div className="flex items-center gap-3 flex-none">
                      <label className="flex flex-col items-center gap-0.5">
                        <span className="text-[9px] text-slate-500 uppercase font-bold">Gols</span>
                        <input
                          type="number" min="0" value={r.goals}
                          onChange={e => updateResult(p.playerId, 'goals', Number(e.target.value))}
                          className="w-12 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white text-center focus:border-orange-500 outline-none"
                        />
                      </label>
                      <label className="flex flex-col items-center gap-0.5">
                        <span className="text-[9px] text-yellow-500 uppercase font-bold">Amarelo</span>
                        <input
                          type="number" min="0" value={r.yellowCards}
                          onChange={e => updateResult(p.playerId, 'yellowCards', Number(e.target.value))}
                          className="w-12 bg-slate-950 border border-yellow-700/50 rounded-lg p-1.5 text-white text-center focus:border-yellow-500 outline-none"
                        />
                      </label>
                      <label className="flex flex-col items-center gap-0.5">
                        <span className="text-[9px] text-red-500 uppercase font-bold">Vermelho</span>
                        <input
                          type="number" min="0" value={r.redCards}
                          onChange={e => updateResult(p.playerId, 'redCards', Number(e.target.value))}
                          className="w-12 bg-slate-950 border border-red-700/50 rounded-lg p-1.5 text-white text-center focus:border-red-500 outline-none"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
      >
        <i className={`fa-solid ${isSaving ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
        {isSaving ? 'Salvando...' : pelada.status === 'concluída' ? 'Salvar Correção' : 'Salvar Resultado'}
      </button>
    </div>
  );
};

export default PeladaEditor;
