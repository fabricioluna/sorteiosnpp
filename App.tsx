import React, { useState, useEffect } from 'react';
import { AppStep, Player, Position, Team } from './types';
import { balanceTeams } from './utils/sorting';
import { db } from './utils/database';
import logoSnpp from './logosnpp.png';
import AdminPanel from './components/AdminPanel';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'sorteio' | 'admin'>('sorteio');
  const [step, setStep] = useState<AppStep>('input');
  const [matchDate, setMatchDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [useChampionMode, setUseChampionMode] = useState(false);
  const [championText, setChampionText] = useState('');
  const [rawText, setRawText] = useState('');
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  // --- ESTADO PARA O MODAL DE CADASTRO RÁPIDO ---
  const [showQuickRegister, setShowQuickRegister] = useState(false);
  const [tempPlayersToRegister, setTempPlayersToRegister] = useState<Player[]>([]);

  // --- PERSISTÊNCIA ---
  useEffect(() => {
    const savedPlayers = localStorage.getItem('snpp_players');
    const savedStep = localStorage.getItem('snpp_step');
    const savedTeams = localStorage.getItem('snpp_teams');
    const savedMatchDate = localStorage.getItem('snpp_match_date');

    if (savedPlayers) {
      const parsed = JSON.parse(savedPlayers);
      if (parsed.length > 0) setPlayers(parsed);
    }
    if (savedTeams) setTeams(JSON.parse(savedTeams));
    if (savedStep && savedPlayers && JSON.parse(savedPlayers).length > 0) {
      setStep(savedStep as AppStep);
    }
    if (savedMatchDate) setMatchDate(savedMatchDate);
  }, []);

  useEffect(() => {
    localStorage.setItem('snpp_players', JSON.stringify(players));
    localStorage.setItem('snpp_step', step);
    localStorage.setItem('snpp_teams', JSON.stringify(teams));
    localStorage.setItem('snpp_match_date', matchDate);
  }, [players, step, teams, matchDate]);

  const cleanNames = (text: string) => {
    return text.split('\n')
      .map(line => line.replace(/^[\d\.\-\:\)\(\[\]\s]+/, '').replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim())
      .filter(name => name.length >= 2);
  };

  const handleGenerateList = () => {
    let finalPlayers: Player[] = [];
    
    const getPlayerData = (lineText: string, isChamp: boolean) => {
      const codeMatch = lineText.match(/#\s*(\d{3})/);
      const extractedCode = codeMatch ? codeMatch[1] : null;
      const cleanName = lineText.replace(/#\s*\d{3}/, '').trim();

      let dbPlayer: Player | undefined;

      if (extractedCode) dbPlayer = db.findByCode(extractedCode);
      if (!dbPlayer) dbPlayer = db.findByName(cleanName);
      
      if (dbPlayer) {
        return { ...dbPlayer, id: `match-${Date.now()}-${Math.random()}`, isFixedInTeam1: isChamp };
      }

      return {
        id: `temp-${Date.now()}-${Math.random()}`,
        code: extractedCode || '---',
        name: cleanName,
        position: 'Meia' as Position,
        level: isChamp ? 10 : 5,
        redCards: 0,
        goals: 0,
        isFixedInTeam1: isChamp
      };
    };

    if (useChampionMode) {
      const champions = cleanNames(championText);
      const challengers = cleanNames(rawText);
      
      if (champions.length !== 5) { alert("Time campeão deve ter 5."); return; }
      const total = champions.length + challengers.length;
      if (total !== 20 && !confirm(`Total: ${total}. Continuar?`)) return;

      const championObjs = champions.map(line => getPlayerData(line, true));
      const challengerObjs = challengers.slice(0, 15).map(line => getPlayerData(line, false));
      finalPlayers = [...championObjs, ...challengerObjs];
    } else {
      const allNames = cleanNames(rawText);
      if (allNames.length === 0) { alert("Nenhum nome."); return; }
      finalPlayers = allNames.slice(0, 20).map(line => getPlayerData(line, false));
    }

    setPlayers(finalPlayers);
    setStep('classify');
  };

  const handleUpdatePlayer = (id: string, updates: Partial<Player>) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const handleSortTeams = () => {
    const tempPlayers = players.filter(p => p.code === '---');
    if (tempPlayers.length > 0) {
      setTempPlayersToRegister(tempPlayers);
      setShowQuickRegister(true);
    } else {
      proceedToSort();
    }
  };

  const proceedToSort = () => {
    const result = balanceTeams(players);
    setTeams(result);
    setStep('results');
    setShowQuickRegister(false);
  };

  const handleQuickSave = (tempId: string, name: string, position: Position, level: number) => {
    const newDbPlayer = db.addPlayer({ name, position, level });
    setPlayers(prev => prev.map(p => {
      if (p.id === tempId) {
        return {
          ...newDbPlayer, 
          id: p.id,
          isFixedInTeam1: p.isFixedInTeam1
        };
      }
      return p;
    }));
    setTempPlayersToRegister(prev => prev.filter(p => p.id !== tempId));
  };

  const handleReset = () => {
    if (confirm('Limpar tudo?')) {
      setStep('input');
      setPlayers([]);
      setTeams([]);
      localStorage.removeItem('snpp_players');
      localStorage.removeItem('snpp_step');
      localStorage.removeItem('snpp_teams');
      setRawText('');
      setChampionText('');
    }
  };

  // --- LÓGICA DE CÓPIA PARA WHATSAPP ATUALIZADA ---
  const handleCopyTeams = () => {
    const dateFormatted = matchDate.split('-').reverse().join('/');
    
    const text = teams
      .filter(t => t.players.length > 0)
      .map(t => {
        const playerList = t.players.map(p => {
          // Adiciona o código se ele existir
          const codeStr = p.code !== '---' ? ` #${p.code}` : '';
          return `• ${p.name}${codeStr} (${p.position})`;
        }).join('\n');
        
        const forceInfo = t.players.length === 5 ? `(Força: ${t.totalLevel})` : '(Incompleto)';
        return `*${t.name}* ${forceInfo}\n${playerList}`;
      }).join('\n\n');

    navigator.clipboard.writeText(`⚽ *O SHOW NÃO PODE PARAR* ⚽\n📅 Data: ${dateFormatted}\n\n${text}`)
      .then(() => alert('Copiado!'))
      .catch(() => alert('Erro ao copiar.'));
  };

  const positions: { id: Position; icon: string; label: string }[] = [
    { id: 'Zagueiro', icon: '🛡️', label: 'Zag' },
    { id: 'Meia', icon: '🎯', label: 'Meia' },
    { id: 'Atacante', icon: '🚀', label: 'Ata' },
  ];

  const getLevelColor = (level: number) => {
    if (level >= 9) return 'text-purple-400';
    if (level >= 7) return 'text-green-400';
    if (level >= 5) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (currentView === 'admin') {
    return (
      <div className="min-h-screen bg-[#020617] text-gray-100 font-inter p-4">
        <div className="max-w-4xl mx-auto"><AdminPanel onBack={() => setCurrentView('sorteio')} /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center pb-12 bg-[#020617] text-gray-100 selection:bg-orange-500 selection:text-white font-inter">
      
      {/* MODAL DE CADASTRO RÁPIDO */}
      {showQuickRegister && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-800 bg-slate-950 rounded-t-2xl">
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <i className="fa-solid fa-user-plus text-orange-500"></i>
                Jogadores Não Cadastrados
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Deseja salvar estes atletas no banco de dados para os próximos jogos?
              </p>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              {tempPlayersToRegister.length === 0 ? (
                <div className="text-center py-8 text-green-400 font-bold flex flex-col items-center gap-2">
                  <i className="fa-solid fa-check-circle text-4xl"></i>
                  <p>Todos os jogadores foram processados!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tempPlayersToRegister.map(p => (
                    <QuickRegisterRow key={p.id} player={p} onSave={handleQuickSave} />
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-800 bg-slate-950 rounded-b-2xl flex justify-between gap-4">
              <button 
                onClick={() => proceedToSort()}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-colors"
              >
                Pular Restantes e Sortear
              </button>
              {tempPlayersToRegister.length === 0 && (
                <button 
                  onClick={() => proceedToSort()}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg transition-colors animate-pulse"
                >
                  Concluir e Sortear
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="w-full py-8 flex flex-col items-center justify-center space-y-4 relative">
        <button onClick={() => setCurrentView('admin')} className="absolute top-4 right-4 bg-slate-800 hover:bg-orange-600 text-orange-500 hover:text-white transition-all px-3 py-2 rounded-lg flex items-center gap-2 border border-slate-700 shadow-lg z-50">
          <span className="text-xs font-bold uppercase tracking-widest">Admin</span><i className="fa-solid fa-gear"></i>
        </button>
        <div className="w-32 h-32 md:w-40 md:h-40 relative drop-shadow-2xl hover:scale-105 transition-transform duration-300">
          <img src={logoSnpp} alt="Brasão SNPP" className="w-full h-full object-contain drop-shadow-lg" />
        </div>
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white drop-shadow-md text-center px-4">O Show Não Pode Parar</h1>
        <p className="text-[10px] opacity-75 font-bold tracking-[0.2em] uppercase text-orange-500">Sorteador Oficial</p>
      </header>

      <main className="w-full max-w-4xl px-4 flex-1">
        {step === 'input' && (
          <div className="bg-slate-900 rounded-2xl shadow-2xl p-6 border border-slate-800 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2 text-orange-500"><i className="fa-solid fa-calendar-days"></i> Configuração da Partida</h2>
              <button onClick={handleReset} className="text-slate-500 hover:text-red-400 text-xs font-bold uppercase tracking-widest flex items-center gap-1 transition-colors"><i className="fa-solid fa-trash"></i> Limpar Tudo</button>
            </div>
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Data do Jogo</label>
              <input type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:border-orange-500 outline-none font-bold" />
            </div>
            <div className="border-t border-slate-800 my-6"></div>
            <div className="mb-6 p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-4 cursor-pointer hover:border-orange-500/50 transition-colors" onClick={() => setUseChampionMode(!useChampionMode)}>
              <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${useChampionMode ? 'bg-orange-500 border-orange-500' : 'border-slate-600'}`}>{useChampionMode && <i className="fa-solid fa-check text-white text-sm"></i>}</div>
              <div><h3 className="font-bold text-white">Time Campeão da Pelada Anterior?</h3><p className="text-xs text-slate-400">Marque para manter os 5 campeões juntos no Time 1.</p></div>
            </div>
            {useChampionMode && (
              <div className="mb-6 animate-in slide-in-from-top-2 duration-300">
                <label className="block text-sm font-bold text-yellow-500 mb-2 uppercase tracking-wider"><i className="fa-solid fa-trophy mr-1"></i> Lista do Time Campeão (5 Atletas)</label>
                <textarea className="w-full h-32 p-4 bg-[#1a1c2e] border-2 border-yellow-500/30 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none resize-none font-mono text-sm text-yellow-100 placeholder-yellow-500/20" placeholder="Cole aqui os 5 nomes... (ex: Nome #001)" value={championText} onChange={(e) => setChampionText(e.target.value)} />
              </div>
            )}
            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">{useChampionMode ? `Lista dos Desafiantes` : `Lista Completa (20 Atletas)`}</label>
              <p className="text-xs text-slate-500 mb-2">* Dica: Digite "Apelido #001" para puxar o cadastro do jogador 001 automaticamente.</p>
              <textarea className="w-full h-48 p-4 bg-slate-950 border-2 border-slate-800 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none font-mono text-sm text-gray-200 placeholder-slate-700" placeholder={useChampionMode ? "Cole aqui os outros jogadores..." : "Cole a lista completa..."} value={rawText} onChange={(e) => setRawText(e.target.value)} />
            </div>
            <button onClick={handleGenerateList} disabled={!rawText.trim()} className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-all active:scale-95 flex items-center justify-center gap-2">INICIAR CONVOCAÇÃO <i className="fa-solid fa-arrow-right"></i></button>
          </div>
        )}

        {step === 'classify' && (
          <div className="bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-800 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="p-4 md:p-6 bg-slate-900/50 border-b border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-20 backdrop-blur-md">
              <div className="flex items-center gap-4 w-full md:w-auto">
                <button onClick={() => setStep('input')} className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg text-xs md:text-sm font-bold flex items-center gap-2 transition-colors border border-slate-700"><i className="fa-solid fa-arrow-left"></i> Voltar</button>
                <h2 className="text-lg md:text-xl font-bold text-white whitespace-nowrap">Conferência ({players.length})</h2>
              </div>
              <button onClick={handleReset} className="text-slate-500 hover:text-red-400 text-xs md:text-sm font-bold uppercase tracking-wider flex items-center gap-1 transition-colors"><i className="fa-solid fa-trash"></i> Limpar Tudo</button>
            </div>
            <div className="divide-y divide-slate-800 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {players.map((player) => (
                <div key={player.id} className={`p-3 md:p-4 flex flex-col gap-3 transition-colors ${player.isFixedInTeam1 ? 'bg-yellow-500/10 border-l-4 border-yellow-500' : 'hover:bg-slate-800/50'}`}>
                  <div className="flex items-center gap-2">
                    {player.code !== '---' && <span className="text-[10px] font-mono font-bold bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">#{player.code}</span>}
                    {player.isFixedInTeam1 && <i className="fa-solid fa-crown text-yellow-500" title="Campeão Atual"></i>}
                    <input type="text" value={player.name} onChange={(e) => handleUpdatePlayer(player.id, { name: e.target.value })} className={`w-full bg-transparent font-bold text-lg border-b border-transparent focus:border-orange-500 outline-none truncate ${player.isFixedInTeam1 ? 'text-yellow-100' : 'text-white'}`} />
                  </div>
                  <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                    <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800 overflow-x-auto">
                      {positions.map((pos) => (
                        <button key={pos.id} onClick={() => handleUpdatePlayer(player.id, { position: pos.id })} className={`relative flex items-center gap-1.5 px-3 py-2 rounded-md transition-all duration-200 ${player.position === pos.id ? 'bg-orange-500 text-white shadow-lg scale-105 z-10' : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800'}`}><span className="text-lg md:text-xl">{pos.icon}</span><span className="text-[10px] font-bold uppercase tracking-wider">{pos.label}</span></button>
                      ))}
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">Nível Técnico (1-10)</span>
                      <div className="grid grid-cols-10 md:grid-cols-10 gap-1">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                          <button key={num} onClick={() => handleUpdatePlayer(player.id, { level: num })} className={`w-7 h-8 md:w-8 md:h-8 rounded flex items-center justify-center font-bold text-sm transition-all ${player.level === num ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg scale-110 z-10 ring-1 ring-orange-300' : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-200'}`}>{num}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 md:p-6 bg-slate-900 border-t border-slate-800">
              <button onClick={handleSortTeams} className="w-full py-4 bg-[#1E3A8A] hover:bg-[#254ab2] text-white font-bold rounded-xl shadow-lg shadow-blue-500/10 transition-all active:scale-95 flex items-center justify-center gap-2 border border-blue-700">SORTEAR TIMES <i className="fa-solid fa-shuffle"></i></button>
            </div>
          </div>
        )}

        {step === 'results' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl shadow-xl border-l-4 border-orange-500 border border-slate-800 relative">
               <div className="w-full md:w-auto text-center md:text-left"><h2 className="text-2xl font-black text-white italic">Times Definidos!</h2><p className="text-slate-400 text-sm">Prontos para o jogo.</p></div>
               <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                 <button onClick={handleReset} className="px-4 py-3 text-red-400 hover:text-red-300 hover:bg-red-400/10 font-bold rounded-xl border border-red-400/30 transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wide"><i className="fa-solid fa-trash"></i> Limpar Tudo</button>
                 <button onClick={handleCopyTeams} className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-500/20 transition-all flex items-center justify-center gap-2"><i className="fa-brands fa-whatsapp"></i> Copiar Resultado</button>
               </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {teams.filter(t => t.players.length > 0).map((team, idx) => {
                const headerColors = ['bg-blue-800', 'bg-orange-600', 'bg-slate-700', 'bg-yellow-600'];
                const isFull = team.players.length === 5;
                const isChampionTeam = team.id === 1 && team.name.includes("Campeão");
                return (
                  <div key={team.id} className={`rounded-2xl shadow-2xl overflow-hidden border bg-slate-900 flex flex-col ${isChampionTeam ? 'border-yellow-500 ring-2 ring-yellow-500/20' : 'border-slate-800'}`}>
                    <div className={`${headerColors[idx]} text-white p-3 md:p-4 flex justify-between items-center`}>
                      <div className="flex items-center gap-2">{isChampionTeam && <i className="fa-solid fa-crown text-yellow-300 animate-pulse"></i>}<h3 className="font-black text-lg md:text-xl uppercase italic tracking-widest">{team.name}</h3></div>
                      <div className="flex flex-col items-end"><span className="text-[10px] uppercase opacity-80 font-bold">{isFull ? 'Força' : ''}</span><span className="font-black text-xl">{isFull ? team.totalLevel : ''}</span></div>
                    </div>
                    <div className="p-3 md:p-4 flex-1">
                      <ul className="space-y-2 md:space-y-3">
                        {team.players.map((p) => (
                          <li key={p.id} className="flex justify-between items-center border-b border-slate-800 pb-2 last:border-0 last:pb-0">
                            <div>
                              <div className={`font-bold text-sm md:text-base flex items-center gap-2 ${p.isFixedInTeam1 ? 'text-yellow-400' : 'text-gray-100'}`}>
                                {p.name}
                                {/* CÓDIGO NO RESULTADO VISUAL */}
                                {p.code !== '---' && <span className="text-slate-500 text-[10px] font-mono">#{p.code}</span>}
                              </div>
                              <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{p.position}</div>
                            </div>
                            <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-800"><span className={`font-black text-sm ${getLevelColor(p.level)}`}>{p.level}</span><i className="fa-solid fa-bolt text-[10px] text-slate-600"></i></div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col gap-3 pt-4">
               <button onClick={() => setTeams(balanceTeams(players))} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2"><i className="fa-solid fa-rotate-right"></i> Refazer Sorteio</button>
               <button onClick={() => setStep('classify')} className="w-full py-3 text-slate-400 hover:text-white font-bold transition-colors text-sm">Voltar e Editar Jogadores</button>
            </div>
          </div>
        )}
      </main>
      <footer className="mt-12 text-center px-4 pb-8 flex flex-col gap-6 items-center">
        <button onClick={() => setCurrentView('admin')} className="text-slate-600 hover:text-orange-500 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2"><i className="fa-solid fa-lock"></i> Acesso Restrito (Admin)</button>
        <div className="inline-block relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 to-blue-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
          <p className="relative text-orange-500 font-black text-xl md:text-2xl tracking-tighter uppercase italic drop-shadow-[0_2px_10px_rgba(249,115,22,0.3)] animate-pulse-slow">Desenvolvido por Fabrício Luna</p>
        </div>
      </footer>
    </div>
  );
};

// Componente Auxiliar para Linha de Cadastro Rápido
const QuickRegisterRow: React.FC<{ player: Player; onSave: (id: string, name: string, pos: Position, lvl: number) => void }> = ({ player, onSave }) => {
  const [name, setName] = useState(player.name);
  const [position, setPosition] = useState(player.position);
  const [level, setLevel] = useState(player.level);

  return (
    <div className="bg-slate-800 p-4 rounded-xl flex flex-col gap-3 border border-slate-700">
      <div className="flex flex-col md:flex-row gap-3">
        <input 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          className="flex-1 bg-slate-950 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-orange-500 outline-none"
          placeholder="Nome do Jogador"
        />
        <div className="flex gap-2">
          <select 
            value={position} 
            onChange={(e) => setPosition(e.target.value as Position)} 
            className="bg-slate-950 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-orange-500 outline-none"
          >
            <option value="Zagueiro">Zagueiro</option>
            <option value="Meia">Meia</option>
            <option value="Atacante">Atacante</option>
          </select>
          <input 
            type="number" min="1" max="10"
            value={level} 
            onChange={(e) => setLevel(Number(e.target.value))} 
            className="w-16 bg-slate-950 border border-slate-600 rounded-lg px-2 py-2 text-white focus:border-orange-500 outline-none text-center"
          />
        </div>
      </div>
      <button 
        onClick={() => onSave(player.id, name, position, level)}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 text-sm"
      >
        <i className="fa-solid fa-floppy-disk"></i> Salvar no Banco
      </button>
    </div>
  );
};

export default App;
