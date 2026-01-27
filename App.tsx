
import React, { useState } from 'react';
import { AppStep, Player, Position, Team } from './types';
import { balanceTeams } from './utils/sorting';
import StarRating from './components/StarRating';

const PRIMARY_ORANGE = '#FF8C00';
const DEEP_BLUE = '#0F172A'; // Darker blue for background
const CREST_BLUE = '#1E3A8A'; // Original crest blue

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>('input');
  const [rawText, setRawText] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  const handleGenerateList = () => {
    const lines = rawText.split('\n');
    // Regex para limpar: remove números iniciais, emojis e caracteres especiais
    const allCleanedNames = lines
      .map((line) => {
        return line
          .replace(/^[\d\.\-\:\)\(\[\]\s]+/, '') // Remove números e pontuação no início da linha
          .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // Remove emojis
          .trim();
      })
      .filter(name => name.length >= 2);

    const totalFound = allCleanedNames.length;

    if (totalFound === 0) {
      alert("Nenhum atleta identificado. Verifique se colou a lista corretamente.");
      return;
    }

    // Validação de quantidade conforme solicitado
    if (totalFound > 20) {
      alert(`Atenção: Foram encontrados ${totalFound} atletas. Isso ultrapassa o limite de 20 atletas. Apenas os primeiros 20 serão considerados para a pelada.`);
    } else if (totalFound < 20) {
      const confirmProceed = confirm(`Foram encontrados ${totalFound} atletas. O sorteio ideal é com 20 atletas. Deseja realizar o sorteio mesmo assim? (Os últimos times podem ficar incompletos)`);
      if (!confirmProceed) return;
    } else {
      alert(`Sucesso! Exatamente ${totalFound} atletas identificados.`);
    }

    const finalPlayers: Player[] = allCleanedNames
      .slice(0, 20)
      .map((name, idx) => ({
        id: `player-${idx}-${Date.now()}`,
        name,
        position: 'Meia' as Position,
        level: 3
      }));

    setPlayers(finalPlayers);
    setStep('classify');
  };

  const handleUpdatePlayer = (id: string, updates: Partial<Player>) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const handleSortTeams = () => {
    const result = balanceTeams(players);
    setTeams(result);
    setStep('results');
  };

  const handleCopyTeams = () => {
    const text = teams
      .filter(t => t.players.length > 0)
      .map(t => {
        const playerList = t.players.map(p => `• ${p.name} (${p.position})`).join('\n');
        const forceInfo = t.players.length === 5 ? `(Força Total: ${t.totalLevel})` : '(Time Incompleto)';
        return `*${t.name}* ${forceInfo}\n${playerList}`;
      }).join('\n\n');

    navigator.clipboard.writeText(`⚽ *O SHOW NÃO PODE PARAR - TIMES SORTEADOS* ⚽\n\n${text}`)
      .then(() => alert('Times copiados para o WhatsApp!'))
      .catch(() => alert('Erro ao copiar times.'));
  };

  return (
    <div className="min-h-screen flex flex-col items-center pb-12 bg-[#020617] text-gray-100">
      {/* Header */}
      <header className="w-full bg-[#1E3A8A] text-white py-6 shadow-2xl mb-8 relative overflow-hidden border-b-4 border-orange-500">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <div className="bg-white p-1 rounded-full border-2 border-orange-500 shadow-lg">
               <img src="logosnpp.png" alt="Logo" className="w-12 h-12 rounded-full object-cover" onError={(e) => {
                 (e.target as HTMLImageElement).src = 'https://img.icons8.com/ios-filled/50/000000/football.png';
               }} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black uppercase italic tracking-tighter leading-none">
                O Show Não Pode Parar
              </h1>
              <p className="text-[10px] opacity-75 font-bold tracking-[0.2em] uppercase">Sorteador Oficial</p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500 opacity-10 -mr-20 -mt-20 rounded-full blur-3xl"></div>
      </header>

      <main className="w-full max-w-4xl px-4 flex-1">
        
        {/* STEP 1: INPUT */}
        {step === 'input' && (
          <div className="bg-slate-900 rounded-2xl shadow-2xl p-6 border border-slate-800 animate-in fade-in zoom-in duration-300">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-orange-500">
              <i className="fa-solid fa-paste"></i>
              Importar Lista do WhatsApp
            </h2>
            <p className="text-slate-400 mb-4 text-sm">
              Cole a lista de atletas abaixo (serão identificados os primeiros 20).
            </p>
            <textarea
              className="w-full h-64 p-4 bg-slate-950 border-2 border-slate-800 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all resize-none mb-6 font-mono text-sm text-gray-200 placeholder-slate-700"
              placeholder="1. João Silva ⚽&#10;2. Pedro Alcantara 🏃‍♂️&#10;..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
            <button
              onClick={handleGenerateList}
              disabled={!rawText.trim()}
              className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              GERAR LISTA DE ATLETAS
              <i className="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        )}

        {/* STEP 2: CLASSIFY */}
        {step === 'classify' && (
          <div className="bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-800 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="p-6 bg-slate-900/50 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Classificar Atletas ({players.length}/20)</h2>
              <button 
                onClick={() => setStep('input')}
                className="text-slate-500 hover:text-red-400 text-sm font-semibold transition-colors"
              >
                Recomeçar
              </button>
            </div>
            
            <div className="divide-y divide-slate-800 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {players.map((player) => (
                <div key={player.id} className="p-4 flex flex-col md:flex-row md:items-center gap-4 hover:bg-slate-800/50 transition-colors">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={player.name}
                      onChange={(e) => handleUpdatePlayer(player.id, { name: e.target.value })}
                      className="w-full bg-transparent font-bold text-lg border-b border-transparent focus:border-orange-500 outline-none text-white"
                    />
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2">
                      <select
                        value={player.position}
                        onChange={(e) => handleUpdatePlayer(player.id, { position: e.target.value as Position })}
                        className="bg-slate-950 text-white rounded-lg px-3 py-2 text-sm font-bold border border-slate-800 outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="Zagueiro">🛡️ Zagueiro</option>
                        <option value="Meia">🎯 Meia</option>
                        <option value="Atacante">🚀 Atacante</option>
                      </select>
                    </div>

                    <div className="flex flex-col items-start md:items-center">
                      <span className="text-[10px] uppercase text-slate-500 font-bold mb-1">Nível Técnico</span>
                      <StarRating
                        rating={player.level}
                        onChange={(val) => handleUpdatePlayer(player.id, { level: val })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 bg-slate-900 border-t border-slate-800">
              <button
                onClick={handleSortTeams}
                className="w-full py-4 bg-[#1E3A8A] hover:bg-[#254ab2] text-white font-bold rounded-xl shadow-lg shadow-blue-500/10 transition-all active:scale-95 flex items-center justify-center gap-2 border border-blue-700"
              >
                SORTEAR TIMES EQUILIBRADOS
                <i className="fa-solid fa-shuffle"></i>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: RESULTS */}
        {step === 'results' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl shadow-xl border-l-4 border-orange-500 border border-slate-800">
               <div>
                  <h2 className="text-2xl font-black text-white italic">É hora do Show! 🏟️</h2>
                  <p className="text-slate-400">Times balanceados com precisão.</p>
               </div>
               <div className="flex gap-2">
                 <button 
                  onClick={handleCopyTeams}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-500/20 transition-all flex items-center gap-2"
                 >
                   <i className="fa-brands fa-whatsapp"></i>
                   COPIAR TIMES
                 </button>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {teams.filter(t => t.players.length > 0).map((team, idx) => {
                const headerColors = [
                   'bg-blue-800',
                   'bg-orange-600',
                   'bg-slate-700',
                   'bg-yellow-600'
                ];

                const isFull = team.players.length === 5;

                return (
                  <div key={team.id} className="rounded-2xl shadow-2xl overflow-hidden border border-slate-800 bg-slate-900 flex flex-col transform hover:scale-[1.02] transition-transform">
                    <div className={`${headerColors[idx]} text-white p-4 flex justify-between items-center`}>
                      <div className="flex flex-col">
                        <h3 className="font-black text-xl uppercase italic tracking-widest">{team.name}</h3>
                        {!isFull && <span className="text-[10px] font-bold bg-black/30 px-2 py-0.5 rounded">TIME INCOMPLETO</span>}
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase opacity-80 font-bold">
                          {isFull ? 'Força' : ''}
                        </span>
                        <span className="font-black text-xl">
                          {isFull ? team.totalLevel : ''}
                        </span>
                      </div>
                    </div>
                    <div className="p-4 flex-1">
                      <ul className="space-y-3">
                        {team.players.map((p) => (
                          <li key={p.id} className="flex justify-between items-center border-b border-slate-800 pb-2">
                            <div className="flex flex-col">
                              <span className="font-bold text-gray-100">{p.name}</span>
                              <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{p.position}</span>
                            </div>
                            <div className="flex gap-0.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <i key={i} className={`fa-solid fa-star text-[10px] ${i < p.level ? 'text-orange-500' : 'text-slate-800'}`}></i>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col md:flex-row items-center justify-center gap-4 pt-4">
               <button
                  onClick={() => setTeams(balanceTeams(players))}
                  className="w-full md:w-auto px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2"
               >
                 <i className="fa-solid fa-rotate-right"></i>
                 REFRESCAR SORTEIO
               </button>
               <button
                  onClick={() => setStep('classify')}
                  className="w-full md:w-auto px-8 py-3 text-slate-400 hover:text-white font-bold transition-colors"
               >
                 VOLTAR PARA CLASSIFICAÇÃO
               </button>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-20 text-center px-4 pb-16">
        <div className="inline-block relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 to-blue-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
          <p className="relative text-orange-500 font-black text-xl md:text-2xl tracking-tighter uppercase italic drop-shadow-[0_2px_10px_rgba(249,115,22,0.3)] animate-pulse-slow">
            Desenvolvido por Fabrício Luna
          </p>
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0f172a;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1e293b;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(0.98); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
};

export default App;
