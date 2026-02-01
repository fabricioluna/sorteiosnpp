import React, { useState, useEffect } from 'react';
import { AppStep, Player, Position, Team } from './types';
import { balanceTeams } from './utils/sorting';
import StarRating from './components/StarRating';
import logoSnpp from './logosnpp.png';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>('input');
  
  // Estado para os inputs
  const [useChampionMode, setUseChampionMode] = useState(false);
  const [championText, setChampionText] = useState('');
  const [rawText, setRawText] = useState('');
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  // --- PERSISTÊNCIA (LocalStorage) ---
  useEffect(() => {
    const savedPlayers = localStorage.getItem('snpp_players');
    const savedStep = localStorage.getItem('snpp_step');
    const savedTeams = localStorage.getItem('snpp_teams');
    const savedChampMode = localStorage.getItem('snpp_use_champ');
    const savedChampText = localStorage.getItem('snpp_champ_text');

    if (savedPlayers) {
      const parsed = JSON.parse(savedPlayers);
      if (parsed.length > 0) setPlayers(parsed);
    }
    if (savedTeams) setTeams(JSON.parse(savedTeams));
    if (savedStep && savedPlayers && JSON.parse(savedPlayers).length > 0) {
      setStep(savedStep as AppStep);
    }
    if (savedChampMode) setUseChampionMode(JSON.parse(savedChampMode));
    if (savedChampText) setChampionText(savedChampText);
  }, []);

  useEffect(() => {
    localStorage.setItem('snpp_players', JSON.stringify(players));
    localStorage.setItem('snpp_step', step);
    localStorage.setItem('snpp_teams', JSON.stringify(teams));
    localStorage.setItem('snpp_use_champ', JSON.stringify(useChampionMode));
    localStorage.setItem('snpp_champ_text', championText);
  }, [players, step, teams, useChampionMode, championText]);

  // Função auxiliar para limpar nomes
  const cleanNames = (text: string) => {
    return text.split('\n')
      .map(line => line
        .replace(/^[\d\.\-\:\)\(\[\]\s]+/, '') 
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') 
        .trim())
      .filter(name => name.length >= 2);
  };

  const handleGenerateList = () => {
    let finalPlayers: Player[] = [];

    if (useChampionMode) {
      // Lógica COM Time Campeão
      const champions = cleanNames(championText);
      const challengers = cleanNames(rawText);

      if (champions.length !== 5) {
        alert(`O Time Campeão precisa ter exatamente 5 atletas. Você inseriu ${champions.length}.`);
        return;
      }
      
      const total = champions.length + challengers.length;
      if (total !== 20) {
        const confirmProceed = confirm(`Total de atletas: ${total} (5 Campeões + ${challengers.length} Desafiantes). O ideal é 20. Deseja continuar?`);
        if (!confirmProceed) return;
      }

      // Cria os objetos dos campeões (Fixos no Time 1)
      const championObjs = champions.map((name, idx) => ({
        id: `champ-${idx}-${Date.now()}`,
        name,
        position: 'Meia' as Position,
        level: 1, // Começa com 1 estrela por padrão
        isFixedInTeam1: true
      }));

      // Cria os objetos dos desafiantes
      const challengerObjs = challengers.slice(0, 15).map((name, idx) => ({
        id: `player-${idx}-${Date.now()}`,
        name,
        position: 'Meia' as Position,
        level: 1
      }));

      finalPlayers = [...championObjs, ...challengerObjs];

    } else {
      // Lógica Padrão (Sem Time Campeão)
      const allNames = cleanNames(rawText);
      const totalFound = allNames.length;

      if (totalFound === 0) {
        alert("Nenhum atleta identificado.");
        return;
      }

      if (totalFound > 20) {
        alert(`Atenção: ${totalFound} atletas encontrados. Usaremos os primeiros 20.`);
      } else if (totalFound < 20) {
         if(!confirm(`Apenas ${totalFound} atletas encontrados. Continuar?`)) return;
      }

      finalPlayers = allNames.slice(0, 20).map((name, idx) => ({
        id: `player-${idx}-${Date.now()}`,
        name,
        position: 'Meia' as Position,
        level: 1
      }));
    }

    setPlayers(finalPlayers);
    setStep('classify');
    // Limpa inputs visuais para evitar confusão, mas mantém no state/localstorage se precisar voltar? 
    // Melhor limpar apenas se quiser forçar o usuário a colar de novo se voltar. 
    // Vamos manter por enquanto para UX de correção.
  };

  const handleUpdatePlayer = (id: string, updates: Partial<Player>) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const handleSortTeams = () => {
    const result = balanceTeams(players);
    setTeams(result);
    setStep('results');
  };

  const handleReset = () => {
    if (confirm('Tem certeza? Isso apagará todos os dados atuais.')) {
      setStep('input');
      setPlayers([]);
      setTeams([]);
      localStorage.removeItem('snpp_players');
      localStorage.removeItem('snpp_step');
      localStorage.removeItem('snpp_teams');
    }
  };

  const handleCopyTeams = () => {
    const text = teams
      .filter(t => t.players.length > 0)
      .map(t => {
        const playerList = t.players.map(p => `• ${p.name} (${p.position})`).join('\n');
        const forceInfo = t.players.length === 5 ? `(Força: ${t.totalLevel})` : '(Incompleto)';
        return `*${t.name}* ${forceInfo}\n${playerList}`;
      }).join('\n\n');

    navigator.clipboard.writeText(`⚽ *O SHOW NÃO PODE PARAR* ⚽\n\n${text}`)
      .then(() => alert('Copiado para o WhatsApp!'))
      .catch(() => alert('Erro ao copiar.'));
  };

  const positions: { id: Position; icon: string; label: string }[] = [
    { id: 'Zagueiro', icon: '🛡️', label: 'Zag' },
    { id: 'Meia', icon: '🎯', label: 'Meia' },
    { id: 'Atacante', icon: '🚀', label: 'Ata' },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center pb-12 bg-[#020617] text-gray-100 selection:bg-orange-500 selection:text-white">
      
      {/* Header */}
      <header className="w-full py-8 flex flex-col items-center justify-center space-y-4">
        <div className="w-32 h-32 md:w-40 md:h-40 relative drop-shadow-2xl hover:scale-105 transition-transform duration-300">
          <img src={logoSnpp} alt="Brasão SNPP" className="w-full h-full object-contain drop-shadow-lg" />
        </div>
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white drop-shadow-md text-center px-4 font-inter">
          O Show Não Pode Parar
        </h1>
        <p className="text-[10px] opacity-75 font-bold tracking-[0.2em] uppercase text-orange-500">
          Sorteador Oficial
        </p>
      </header>

      <main className="w-full max-w-4xl px-4 flex-1">
        
        {/* STEP 1: INPUT */}
        {step === 'input' && (
          <div className="bg-slate-900 rounded-2xl shadow-2xl p-6 border border-slate-800 animate-in fade-in zoom-in duration-300">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-orange-500">
              <i className="fa-solid fa-paste"></i> Importar Lista
            </h2>

            {/* CHECKBOX: TIME CAMPEÃO */}
            <div className="mb-6 p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-4 cursor-pointer hover:border-orange-500/50 transition-colors" onClick={() => setUseChampionMode(!useChampionMode)}>
              <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${useChampionMode ? 'bg-orange-500 border-orange-500' : 'border-slate-600'}`}>
                {useChampionMode && <i className="fa-solid fa-check text-white text-sm"></i>}
              </div>
              <div>
                <h3 className="font-bold text-white">Time Campeão da Pelada Anterior?</h3>
                <p className="text-xs text-slate-400">Marque para manter os 5 campeões juntos no Time 1.</p>
              </div>
            </div>

            {useChampionMode && (
              <div className="mb-6 animate-in slide-in-from-top-2 duration-300">
                <label className="block text-sm font-bold text-yellow-500 mb-2 uppercase tracking-wider">
                  <i className="fa-solid fa-trophy mr-1"></i> Lista do Time Campeão (5 Atletas)
                </label>
                <textarea
                  className="w-full h-32 p-4 bg-[#1a1c2e] border-2 border-yellow-500/30 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none resize-none font-mono text-sm text-yellow-100 placeholder-yellow-500/20"
                  placeholder="Cole aqui os 5 nomes do time campeão..."
                  value={championText}
                  onChange={(e) => setChampionText(e.target.value)}
                />
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">
                {useChampionMode ? `Lista dos Desafiantes (15 Atletas)` : `Lista Completa (20 Atletas)`}
              </label>
              <textarea
                className="w-full h-48 p-4 bg-slate-950 border-2 border-slate-800 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none font-mono text-sm text-gray-200 placeholder-slate-700"
                placeholder={useChampionMode ? "Cole aqui os outros 15 jogadores..." : "Cole a lista completa com 20 jogadores..."}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />
            </div>

            <button
              onClick={handleGenerateList}
              disabled={!rawText.trim()}
              className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              INICIAR CONVOCAÇÃO
              <i className="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        )}

        {/* STEP 2: CLASSIFY */}
        {step === 'classify' && (
          <div className="bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-800 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="p-4 md:p-6 bg-slate-900/50 border-b border-slate-800 flex justify-between items-center sticky top-0 z-20 backdrop-blur-md">
              <h2 className="text-lg md:text-xl font-bold text-white">Classificar ({players.length}/20)</h2>
              <button onClick={handleReset} className="text-slate-500 hover:text-red-400 text-xs md:text-sm font-semibold flex items-center gap-1">
                <i className="fa-solid fa-trash"></i> Limpar
              </button>
            </div>
            
            <div className="divide-y divide-slate-800 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {players.map((player) => (
                <div key={player.id} className={`p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3 transition-colors ${player.isFixedInTeam1 ? 'bg-yellow-500/10 border-l-4 border-yellow-500' : 'hover:bg-slate-800/50'}`}>
                  
                  {/* Nome do Jogador */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {player.isFixedInTeam1 && <i className="fa-solid fa-crown text-yellow-500" title="Campeão Atual"></i>}
                      <input
                        type="text"
                        value={player.name}
                        onChange={(e) => handleUpdatePlayer(player.id, { name: e.target.value })}
                        className={`w-full bg-transparent font-bold text-lg border-b border-transparent focus:border-orange-500 outline-none truncate ${player.isFixedInTeam1 ? 'text-yellow-100' : 'text-white'}`}
                      />
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center gap-4">
                    {/* Botões de Posição */}
                    <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800 overflow-x-auto">
                      {positions.map((pos) => (
                        <button
                          key={pos.id}
                          onClick={() => handleUpdatePlayer(player.id, { position: pos.id })}
                          className={`relative flex items-center gap-1.5 px-3 py-2 rounded-md transition-all duration-200 ${player.position === pos.id ? 'bg-orange-500 text-white shadow-lg scale-105 z-10' : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800'}`}
                        >
                          <span className="text-lg md:text-xl">{pos.icon}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider">{pos.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Estrelas */}
                    <div className="flex flex-col items-end md:items-center min-w-[100px]">
                      <span className="text-[9px] uppercase text-slate-500 font-bold mb-0.5 tracking-wider">Nível</span>
                      <StarRating rating={player.level} onChange={(val) => handleUpdatePlayer(player.id, { level: val })} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 md:p-6 bg-slate-900 border-t border-slate-800">
              <button onClick={handleSortTeams} className="w-full py-4 bg-[#1E3A8A] hover:bg-[#254ab2] text-white font-bold rounded-xl shadow-lg shadow-blue-500/10 transition-all active:scale-95 flex items-center justify-center gap-2 border border-blue-700">
                SORTEAR TIMES
                <i className="fa-solid fa-shuffle"></i>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: RESULTS */}
        {step === 'results' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl shadow-xl border-l-4 border-orange-500 border border-slate-800">
               <div>
                  <h2 className="text-2xl font-black text-white italic">Times Definidos!</h2>
                  <p className="text-slate-400 text-sm">Prontos para o jogo.</p>
               </div>
               <button onClick={handleCopyTeams} className="w-full md:w-auto px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-500/20 transition-all flex items-center justify-center gap-2">
                 <i className="fa-brands fa-whatsapp"></i> Copiar Resultado
               </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {teams.filter(t => t.players.length > 0).map((team, idx) => {
                const headerColors = ['bg-blue-800', 'bg-orange-600', 'bg-slate-700', 'bg-yellow-600'];
                const isFull = team.players.length === 5;
                // Destaque visual para o Time 1 se for campeão
                const isChampionTeam = team.id === 1 && team.name.includes("Campeão");

                return (
                  <div key={team.id} className={`rounded-2xl shadow-2xl overflow-hidden border bg-slate-900 flex flex-col ${isChampionTeam ? 'border-yellow-500 ring-2 ring-yellow-500/20' : 'border-slate-800'}`}>
                    <div className={`${headerColors[idx]} text-white p-3 md:p-4 flex justify-between items-center`}>
                      <div className="flex items-center gap-2">
                         {isChampionTeam && <i className="fa-solid fa-crown text-yellow-300 animate-pulse"></i>}
                         <h3 className="font-black text-lg md:text-xl uppercase italic tracking-widest">{team.name}</h3>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase opacity-80 font-bold">{isFull ? 'Força' : ''}</span>
                        <span className="font-black text-xl">{isFull ? team.totalLevel : ''}</span>
                      </div>
                    </div>
                    <div className="p-3 md:p-4 flex-1">
                      <ul className="space-y-2 md:space-y-3">
                        {team.players.map((p) => (
                          <li key={p.id} className="flex justify-between items-center border-b border-slate-800 pb-2 last:border-0 last:pb-0">
                            <div>
                              <div className={`font-bold text-sm md:text-base ${p.isFixedInTeam1 ? 'text-yellow-400' : 'text-gray-100'}`}>
                                {p.name}
                              </div>
                              <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{p.position}</div>
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

            <div className="flex flex-col gap-3 pt-4">
               <button onClick={() => setTeams(balanceTeams(players))} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2">
                 <i className="fa-solid fa-rotate-right"></i> Refazer Sorteio
               </button>
               <button onClick={() => setStep('classify')} className="w-full py-3 text-slate-400 hover:text-white font-bold transition-colors text-sm">
                 Voltar e Editar Jogadores
               </button>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-12 text-center px-4 pb-8">
        <div className="inline-block relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 to-blue-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
          <p className="relative text-orange-500 font-black text-xl md:text-2xl tracking-tighter uppercase italic drop-shadow-[0_2px_10px_rgba(249,115,22,0.3)] animate-pulse-slow">
            Desenvolvido por Fabrício Luna
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
