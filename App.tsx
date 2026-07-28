import React, { useState, useEffect } from 'react';
import { AppStep, Player, Position, Team } from './types';
import { balanceTeams, balanceTeamsByGroups, recommendDrawLevels } from './utils/sorting';
import { db } from './utils/database';
import { peladasDb, getDrawAdjustment } from './utils/peladas';
import { parseConvocationList, ParsedConvocationLine } from './utils/whatsappParser';
import AdminPanel from './components/AdminPanel';
import StarRating from './components/StarRating';
import VotingPage from './components/VotingPage';
import RankingPage from './components/RankingPage';

const logoSnpp = '/logosnpp.png';

const isVotingRoute = () => new URLSearchParams(window.location.search).get('view') === 'votacao';
const isRankingRoute = () => new URLSearchParams(window.location.search).get('view') === 'ranking';

// Linha da pré-visualização da convocação colada (ver etapa 'preview'): estende o resultado
// puro do parser com a correspondência encontrada no cadastro e a marcação de campeão.
interface PreviewRow extends ParsedConvocationLine {
  matchedName: string | null;
  isChampion: boolean;
}

// Resolve um nome + código (opcional) contra o cadastro: usa o jogador real do Firestore quando
// encontrado (por código ou, senão, por nome), ou cria um convidado temporário (sem posição
// definida, precisa ser classificado antes do sorteio — ver Regra 0 em handleSortTeams).
const resolvePlayer = (name: string, code: string | null, isChamp: boolean, allDbPlayers: Player[]): Player => {
  const findByCode = (c: string) => allDbPlayers.find(p => p.code === c);
  const findByName = (n: string) => allDbPlayers.find(p => p.name.toLowerCase() === n.toLowerCase());

  let dbPlayer: Player | undefined;
  if (code) {
    dbPlayer = findByCode(code.padStart(3, '0')) ?? findByCode(code);
  }
  if (!dbPlayer) dbPlayer = findByName(name);

  if (dbPlayer) {
    // Mantém o id real do Firestore (não gera um id temporário de sessão) — é ele que
    // as peladas usam pra rastrear estatísticas e histórico desse jogador entre partidas.
    return { ...dbPlayer, isFixedInTeam1: isChamp };
  }

  return {
    id: `temp-${Date.now()}-${Math.random()}`,
    code: code || '---',
    name,
    position: 'Não definida' as Position,
    level: isChamp ? 5 : 3,
    redCards: 0,
    goals: 0,
    isFixedInTeam1: isChamp,
  };
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'sorteio' | 'admin'>('sorteio');
  const [step, setStep] = useState<AppStep>('input');
  const [matchDate, setMatchDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [useChampionMode, setUseChampionMode] = useState(false);
  const [championText, setChampionText] = useState('');
  const [rawText, setRawText] = useState('');

  // Estado da pré-visualização da convocação colada (só usado fora do modo campeão)
  const [previewLines, setPreviewLines] = useState<PreviewRow[]>([]);
  const [discardedLines, setDiscardedLines] = useState<string[]>([]);

  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [drawGroups, setDrawGroups] = useState<Player[]>([]);
  // Ajuste histórico já calculado (playerId -> valor pronto pra somar ao nível, entre -1 e 1) usado
  // na última recomendação de grupos — só para sinalizar na tela quem foi influenciado pelo histórico.
  const [historicalAdjustments, setHistoricalAdjustments] = useState<Record<string, number>>({});

  // --- ESTADOS PARA MODAIS ---
  const [showQuickRegister, setShowQuickRegister] = useState(false);
  const [tempPlayersToRegister, setTempPlayersToRegister] = useState<Player[]>([]);
  
  // NOVO: Estados para Verificação de Alterações
  const [showUpdateAuth, setShowUpdateAuth] = useState(false);
  const [modifiedPlayers, setModifiedPlayers] = useState<{current: Player, original: Player}[]>([]);
  const [updateAuthPassword, setUpdateAuthPassword] = useState('');

  const [showPlayerSelector, setShowPlayerSelector] = useState<'champion' | 'general' | null>(null);

  // --- PERSISTÊNCIA ---
  useEffect(() => {
    const savedPlayers = localStorage.getItem('snpp_players');
    const savedStep = localStorage.getItem('snpp_step');
    const savedTeams = localStorage.getItem('snpp_teams');
    const savedMatchDate = localStorage.getItem('snpp_match_date');
    const savedDrawGroups = localStorage.getItem('snpp_draw_groups');

    if (savedPlayers) {
      const parsed = JSON.parse(savedPlayers);
      if (parsed.length > 0) setPlayers(parsed);
    }
    if (savedTeams) setTeams(JSON.parse(savedTeams));
    if (savedDrawGroups) setDrawGroups(JSON.parse(savedDrawGroups));
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
    localStorage.setItem('snpp_draw_groups', JSON.stringify(drawGroups));
  }, [players, step, teams, matchDate, drawGroups]);

  // --- AUXILIAR ---
  // Em cada linha, o código do jogador (se houver) é o último token, sem # e sem zeros à esquerda.
  const getLineCode = (line: string): number | null => {
    const tokens = line.trim().split(/\s+/);
    const lastToken = tokens[tokens.length - 1];
    return tokens.length > 1 && /^\d+$/.test(lastToken) ? parseInt(lastToken, 10) : null;
  };

  const extractUsedCodes = (): number[] => {
    const allLines = (championText + '\n' + rawText).split('\n');
    return allLines.map(getLineCode).filter((code): code is number => code !== null);
  };

  const countLines = (text: string) => {
    return text.split('\n').filter(line => line.trim().length > 0).length;
  };

  // --- LÓGICA DE INSERÇÃO ---
  const handleSelectPlayerFromDb = (player: Player) => {
    const usedCodes = extractUsedCodes();
    const playerCodeNum = parseInt(player.code, 10);
    
    if (usedCodes.includes(playerCodeNum)) return;

    const currentChampCount = countLines(championText);
    const currentRawCount = countLines(rawText);
    const totalCount = currentChampCount + currentRawCount;

    if (totalCount >= 20) {
      alert("A lista já atingiu o limite máximo de 20 atletas.");
      return;
    }

    if (showPlayerSelector === 'champion') {
      if (currentChampCount >= 5) {
        alert("O Time Campeão já tem 5 atletas.");
        return;
      }
      setChampionText(prev => (prev.trim() + `\n${player.name} ${parseInt(player.code, 10)}`).trim());
    } else if (showPlayerSelector === 'general') {
      setRawText(prev => (prev.trim() + `\n${player.name} ${parseInt(player.code, 10)}`).trim());
    }
  };

  const handleRemovePlayerFromList = (player: Player) => {
    const numCode = parseInt(player.code, 10);
    const removeLine = (text: string) => text.split('\n').filter(line => getLineCode(line) !== numCode).join('\n');

    if (showPlayerSelector === 'champion') {
      setChampionText(prev => removeLine(prev).trim());
    } else if (showPlayerSelector === 'general') {
      setRawText(prev => removeLine(prev).trim());
    }
  };

  const cleanNames = (text: string) => {
    return text.split('\n')
      .map(line => line.replace(/^[\d\.\-\:\)\(\[\]\s]+/, '').replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim())
      .filter(name => name.length >= 2);
  };

  // Extrai nome + código do formato manual "Nome Número" (uma linha por jogador) — usado só
  // pelo modo campeão, cujas duas caixas de colagem separadas continuam com o parser simples.
  const getPlayerDataFromLine = (lineText: string, isChamp: boolean, allDbPlayers: Player[]): Player => {
    const tokens = lineText.trim().split(/\s+/);
    const lastToken = tokens[tokens.length - 1];
    const hasCode = tokens.length > 1 && /^\d+$/.test(lastToken);
    const extractedCode = hasCode ? lastToken : null;
    const cleanName = hasCode ? tokens.slice(0, -1).join(' ') : lineText.trim();
    return resolvePlayer(cleanName, extractedCode, isChamp, allDbPlayers);
  };

  const handleGenerateList = async () => {
    const allDbPlayers = await db.getAllPlayers();

    if (useChampionMode) {
      const champions = cleanNames(championText);
      const challengers = cleanNames(rawText);

      if (champions.length !== 5) { alert("Time campeão deve ter 5."); return; }
      const total = champions.length + challengers.length;
      if (total !== 20 && !confirm(`Total: ${total}. Continuar?`)) return;

      const championObjs = champions.map(line => getPlayerDataFromLine(line, true, allDbPlayers));
      const challengerObjs = challengers.slice(0, 15).map(line => getPlayerDataFromLine(line, false, allDbPlayers));
      setPlayers([...championObjs, ...challengerObjs]);
      setStep('classify');
      return;
    }

    // Fora do modo campeão: parser tolerante ao formato bagunçado do WhatsApp,
    // com uma etapa de pré-visualização antes de seguir pra classificação.
    const { lines, discardedLines: discarded } = parseConvocationList(rawText);
    if (lines.length === 0) { alert("Nenhum jogador reconhecido na lista colada."); return; }

    const findByCode = (code: string) => allDbPlayers.find(p => p.code === code.padStart(3, '0')) ?? allDbPlayers.find(p => p.code === code);
    const findByName = (name: string) => allDbPlayers.find(p => p.name.toLowerCase() === name.toLowerCase());

    setPreviewLines(lines.map(line => {
      const matched = findByCode(line.code) ?? findByName(line.name);
      return { ...line, matchedName: matched?.name ?? null, isChampion: false };
    }));
    setDiscardedLines(discarded);
    setStep('preview');
  };

  const handleUpdatePreviewLine = (id: string, field: 'name' | 'code', value: string) => {
    setPreviewLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  // Marca os 5 últimos jogadores da lista como o time campeão (fixos, fora do sorteio) —
  // ajustável manualmente clicando em qualquer linha depois.
  const handleMarkChampions = () => {
    setPreviewLines(prev => prev.map((l, idx) => ({ ...l, isChampion: idx >= prev.length - 5 })));
  };

  const handleTogglePreviewChampion = (id: string) => {
    setPreviewLines(prev => prev.map(l => l.id === id ? { ...l, isChampion: !l.isChampion } : l));
  };

  const handleConfirmPreview = async () => {
    const allDbPlayers = await db.getAllPlayers();
    const finalPlayers = previewLines.map(l => resolvePlayer(l.name, l.code || null, l.isChampion, allDbPlayers));
    setPlayers(finalPlayers);
    setStep('classify');
  };

  const handleUpdatePlayer = (id: string, updates: Partial<Player>) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  // --- SORTEIO: PASSO 0 (Regra 0 — bloquear jogador sem posição/nível definido) ---
  const handleSortTeams = () => {
    const unclassified = players.filter(p => p.position === 'Não definida');
    if (unclassified.length > 0) {
      alert(
        `Defina a posição (e revise o nível) de ${unclassified.length} jogador(es) antes de sortear:\n` +
        `${unclassified.map(p => p.name).join(', ')}\n\n` +
        `Ajuste direto na lista acima, ou use a página de votação para avaliar em grupo.`
      );
      return;
    }

    // --- SORTEIO: PASSO 1 (Verificar Convidados) ---
    const tempPlayers = players.filter(p => p.code === '---');
    if (tempPlayers.length > 0) {
      setTempPlayersToRegister(tempPlayers);
      setShowQuickRegister(true);
    } else {
      checkForModifications();
    }
  };

  // --- SORTEIO: PASSO 2 (Verificar Alterações no Cadastro) ---
  const checkForModifications = async () => {
    const allDbPlayers = await db.getAllPlayers();
    const changes: {current: Player, original: Player}[] = [];

    players.forEach(p => {
      // Pula convidados (código ---)
      if (p.code === '---') return;

      // Busca o original no banco pelo código
      const original = allDbPlayers.find(dp => dp.code === p.code);

      if (original) {
        // Verifica se houve mudança em Nível ou Posição
        if (original.level !== p.level || original.position !== p.position) {
          changes.push({ current: p, original });
        }
      }
    });

    if (changes.length > 0) {
      setModifiedPlayers(changes);
      setUpdateAuthPassword('');
      setShowUpdateAuth(true); // Abre o modal de senha
    } else {
      prepareGroups(); // Tudo ok, monta os grupos de nível de sorteio
    }
  };

  // --- SORTEIO: PASSO 3 (Confirmação e Sorteio Final) ---
  const confirmUpdatesAndSort = async () => {
    if (updateAuthPassword !== 'snpp2026') {
      alert('Senha administrativa incorreta.');
      return;
    }

    // Aplica as atualizações no banco de dados
    await Promise.all(modifiedPlayers.map(({ current, original }) =>
      // Precisamos do ID original do banco (que está em 'original.id'), não do ID da partida
      db.updatePlayer(original.id, {
        level: current.level,
        position: current.position
      })
    ));

    setShowUpdateAuth(false);
    prepareGroups();
  };

  const skipUpdatesAndSort = () => {
    if (confirm('Atenção: As alterações feitas NÃO serão salvas no cadastro para a próxima pelada. Deseja continuar apenas com o sorteio?')) {
      setShowUpdateAuth(false);
      prepareGroups();
    }
  };

  // --- SORTEIO: PASSO 4 (Recomendar grupos de nível de sorteio) ---
  // Jogadores fixos (campeões) ficam fora da reclassificação — eles já têm time definido.
  // Só é possível recomendar grupos quando a quantidade de jogadores "livres" é múltiplo de 5;
  // caso contrário (grupo do dia incompleto), cai de volta no sorteio antigo por soma de nível.
  const prepareGroups = async () => {
    const groupablePlayers = players.filter(p => !p.isFixedInTeam1);
    if (groupablePlayers.length % 5 !== 0 || groupablePlayers.length === 0) {
      setDrawGroups([]);
      finalSort([]);
      return;
    }

    const biasByPlayer = await peladasDb.computeHistoricalBias(groupablePlayers.map(p => p.id));
    const adjustments: Record<string, number> = {};
    Object.entries(biasByPlayer).forEach(([playerId, bias]) => {
      const adjustment = getDrawAdjustment(bias);
      if (adjustment !== 0) adjustments[playerId] = adjustment;
    });

    setHistoricalAdjustments(adjustments);
    setDrawGroups(recommendDrawLevels(groupablePlayers, adjustments));
    setStep('groups');
    setShowQuickRegister(false);
  };

  const finalSort = (groups: Player[]) => {
    const fixedPlayers = players.filter(p => p.isFixedInTeam1);
    const result = groups.length > 0
      ? balanceTeamsByGroups([...fixedPlayers, ...groups])
      : balanceTeams(players);
    setTeams(result);
    setStep('results');
    setShowQuickRegister(false);
    // Salva o rascunho da pelada do dia (times sorteados) pro Admin lançar o resultado depois.
    // Não bloqueia a tela em caso de falha — o sorteio já foi mostrado normalmente.
    peladasDb.saveDraft(matchDate, result).catch(e => console.error('Não foi possível salvar a pelada do dia', e));
  };

  // Funções Auxiliares de Cadastro
  const handleUpdateTempPlayer = (id: string, field: keyof Player, value: any) => {
    setTempPlayersToRegister(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleQuickSaveOne = async (tempId: string) => {
    const playerToSave = tempPlayersToRegister.find(p => p.id === tempId);
    if (!playerToSave) return;
    const newDbPlayer = await db.addPlayer({ name: playerToSave.name, position: playerToSave.position, level: playerToSave.level });
    // Usa o id real gerado pelo Firestore (não o id temporário da sessão) — é ele que
    // as estatísticas da pelada (peladasDb) usam pra rastrear o jogador depois.
    setPlayers(prev => prev.map(p => p.id === tempId ? { ...newDbPlayer, isFixedInTeam1: p.isFixedInTeam1 } : p));
    setTempPlayersToRegister(prev => prev.filter(p => p.id !== tempId));
  };

  const handleSaveAll = async () => {
    const updatesMap = new Map<string, Player>();
    // Sequencial de propósito: addPlayer gera o próximo código lendo o cadastro atual,
    // então rodar em paralelo faria vários convidados calcularem o mesmo código.
    for (const p of tempPlayersToRegister) {
      const newDbPlayer = await db.addPlayer({ name: p.name, position: p.position, level: p.level });
      updatesMap.set(p.id, newDbPlayer);
    }
    // Idem: mantém o id real do Firestore, não o id temporário da sessão.
    setPlayers(prev => prev.map(p => updatesMap.has(p.id) ? { ...updatesMap.get(p.id)!, isFixedInTeam1: p.isFixedInTeam1 } : p));
    setTempPlayersToRegister([]);
  };

  const handleReset = () => {
    if (confirm('Limpar tudo?')) {
      setStep('input');
      setPlayers([]);
      setTeams([]);
      setDrawGroups([]);
      localStorage.removeItem('snpp_players');
      localStorage.removeItem('snpp_step');
      localStorage.removeItem('snpp_teams');
      localStorage.removeItem('snpp_draw_groups');
      setRawText('');
      setChampionText('');
    }
  };

  const handleCopyTeams = () => {
    const dateFormatted = matchDate.split('-').reverse().join('/');
    const text = teams.filter(t => t.players.length > 0).map(t => {
      const playerList = t.players.map(p => {
        const codeStr = p.code !== '---' ? ` #${p.code}` : '';
        const levelStr = p.drawLevel !== undefined && p.drawLevel !== p.level
          ? ` (nível ${p.level}→${p.drawLevel})`
          : ` (nível ${p.level})`;
        return `• ${p.name}${codeStr}${levelStr}`;
      }).join('\n');
      const forceInfo = t.players.length === 5 ? `(Força: ${t.totalLevel})` : '(Incompleto)';
      return `*${t.name}* ${forceInfo}\n${playerList}`;
    }).join('\n\n');
    navigator.clipboard.writeText(`⚽ *O SHOW NÃO PODE PARAR* ⚽\n📅 Data: ${dateFormatted}\n\n${text}`).then(() => alert('Copiado!'));
  };

  const positions: { id: Position; icon: string; label: string }[] = [
    { id: 'Zagueiro', icon: '🛡️', label: 'Zag' },
    { id: 'Meia', icon: '🎯', label: 'Meia' },
    { id: 'Atacante', icon: '🚀', label: 'Ata' },
  ];

  const getLevelColor = (level: number) => {
    if (level >= 5) return 'text-purple-400';
    if (level >= 4) return 'text-green-400';
    if (level >= 3) return 'text-yellow-400';
    return 'text-red-400';
  };

  const handleMoveToDrawGroup = (playerId: string, newDrawLevel: number) => {
    setDrawGroups(prev => prev.map(p => p.id === playerId ? { ...p, drawLevel: newDrawLevel } : p));
  };

  const expectedDrawGroupSize = drawGroups.length / 5;
  const drawLevelGroups = [5, 4, 3, 2, 1].map(level => ({
    level,
    players: drawGroups.filter(p => p.drawLevel === level),
  }));
  const isDrawGroupsBalanced = drawLevelGroups.every(g => g.players.length === expectedDrawGroupSize);
  const championsForGroupsScreen = players.filter(p => p.isFixedInTeam1);

  // Códigos repetidos entre as linhas da pré-visualização (só entre quem tem código preenchido) —
  // bloqueia o avanço até o usuário corrigir.
  const previewCodeCounts = new Map<string, number>();
  previewLines.forEach(l => { if (l.code) previewCodeCounts.set(l.code, (previewCodeCounts.get(l.code) ?? 0) + 1); });
  const duplicateCodes = [...previewCodeCounts.entries()].filter(([, count]) => count > 1).map(([code]) => code);

  // Regra 0: jogador sem posição definida não pode ser convocado.
  const unclassifiedPlayers = players.filter(p => p.position === 'Não definida');

  // Regra 0.1: só ativa o balanceamento por níveis quando o grupo "livre" (fora dos campeões fixos)
  // fecha em múltiplo de 5 — senão mantém o algoritmo guloso padrão.
  const groupableCount = players.filter(p => !p.isFixedInTeam1).length;
  const isLevelBalancingActive = groupableCount > 0 && groupableCount % 5 === 0;

  // Agrupa a Conferência por nível técnico (5 -> 1), pra facilitar visualizar quem está em cada nível
  // antes mesmo de chegar na tela de grupos de sorteio. Reagrupa em tempo real conforme o nível é editado.
  const classifyLevelGroups = [5, 4, 3, 2, 1].map(level => ({
    level,
    players: players.filter(p => p.level === level),
  }));

  if (isVotingRoute()) {
    return (
      <div className="min-h-screen bg-[#020617] text-gray-100 font-inter p-4">
        <div className="max-w-2xl mx-auto"><VotingPage /></div>
      </div>
    );
  }

  if (isRankingRoute()) {
    return (
      <div className="min-h-screen bg-[#020617] text-gray-100 font-inter p-4">
        <div className="max-w-2xl mx-auto"><RankingPage /></div>
      </div>
    );
  }

  if (currentView === 'admin') {
    return (
      <div className="min-h-screen bg-[#020617] text-gray-100 font-inter p-4">
        <div className="max-w-4xl mx-auto"><AdminPanel onBack={() => setCurrentView('sorteio')} /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center pb-12 bg-[#020617] text-gray-100 selection:bg-orange-500 selection:text-white font-inter">
      
      {/* MODAL DE SELEÇÃO DE JOGADORES */}
      {showPlayerSelector && (
        <PlayerSelectionModal 
          onClose={() => setShowPlayerSelector(null)} 
          onSelect={handleSelectPlayerFromDb}
          onRemove={handleRemovePlayerFromList}
          usedCodes={extractUsedCodes()} 
        />
      )}

      {/* MODAL DE AUTENTICAÇÃO DE ATUALIZAÇÃO (NOVO) */}
      {showUpdateAuth && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border-2 border-red-500/50 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-red-900/20 p-4 border-b border-red-900/30 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-500">
                <i className="fa-solid fa-triangle-exclamation text-xl"></i>
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">Alterações Detectadas</h3>
                <p className="text-xs text-red-300">Dados do cadastro foram modificados.</p>
              </div>
            </div>

            <div className="p-4 max-h-[40vh] overflow-y-auto custom-scrollbar">
              <p className="text-slate-400 text-sm mb-3">
                Os seguintes atletas tiveram nível ou posição alterados na lista. Deseja <strong>atualizar o cadastro oficial</strong>?
              </p>
              <div className="space-y-2">
                {modifiedPlayers.map(({ current, original }, idx) => (
                  <div key={idx} className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-sm">
                    <div className="font-bold text-white mb-1 flex justify-between">
                      {current.name} <span className="text-slate-500">#{current.code}</span>
                    </div>
                    <div className="flex gap-2 text-xs">
                      {original.position !== current.position && (
                        <span className="bg-slate-800 px-2 py-1 rounded text-slate-300">
                          {original.position} <i className="fa-solid fa-arrow-right text-orange-500 mx-1"></i> <b className="text-white">{current.position}</b>
                        </span>
                      )}
                      {original.level !== current.level && (
                        <span className="bg-slate-800 px-2 py-1 rounded text-slate-300">
                          Nível {original.level} <i className="fa-solid fa-arrow-right text-orange-500 mx-1"></i> <b className="text-white">{current.level}</b>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800">
              <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Senha de Administrador</label>
              <input 
                type="password"
                autoFocus
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-red-500 outline-none mb-4"
                placeholder="Digite a senha..."
                value={updateAuthPassword}
                onChange={(e) => setUpdateAuthPassword(e.target.value)}
              />
              <div className="flex flex-col gap-2">
                <button 
                  onClick={confirmUpdatesAndSort}
                  className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-colors shadow-lg"
                >
                  Confirmar Atualização e Sortear
                </button>
                <button 
                  onClick={skipUpdatesAndSort}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors text-xs"
                >
                  Ignorar (Sortear sem salvar no banco)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CADASTRO RÁPIDO (Mantido) */}
      {showQuickRegister && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-800 bg-slate-950 rounded-t-2xl">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-black text-white flex items-center gap-2">
                    <i className="fa-solid fa-user-plus text-orange-500"></i>
                    Novos Jogadores ({tempPlayersToRegister.length})
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">Cadastro obrigatório antes de sortear — todo convidado precisa de um número, mesmo quem só vem uma vez.</p>
                </div>
                {tempPlayersToRegister.length > 1 && (
                  <button onClick={handleSaveAll} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-xl shadow-lg flex items-center gap-2 text-sm transition-all">
                    <i className="fa-solid fa-save"></i> Salvar Todos
                  </button>
                )}
              </div>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              {tempPlayersToRegister.length === 0 ? (
                <div className="text-center py-8 text-green-400 font-bold flex flex-col items-center gap-2"><i className="fa-solid fa-check-circle text-4xl"></i><p>Todos os jogadores foram processados!</p></div>
              ) : (
                <div className="space-y-4">
                  {tempPlayersToRegister.map(p => (
                    <QuickRegisterRow key={p.id} player={p} onUpdate={handleUpdateTempPlayer} onSave={() => handleQuickSaveOne(p.id)} />
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-800 bg-slate-950 rounded-b-2xl flex justify-between gap-4">
              {tempPlayersToRegister.length === 0 ? (
                <button onClick={() => checkForModifications()} className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg transition-colors animate-pulse">Concluir e Sortear</button>
              ) : (
                <p className="flex-1 text-center text-xs text-slate-500 py-3">
                  <i className="fa-solid fa-lock mr-1.5"></i>
                  Cadastre {tempPlayersToRegister.length === 1 ? 'o jogador acima' : 'todos os jogadores acima'} para liberar o sorteio.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="w-full py-8 flex flex-col items-center justify-center space-y-4 relative">
        <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
          <a href="?view=ranking" className="bg-slate-800 hover:bg-yellow-600 text-yellow-500 hover:text-white transition-all px-3 py-2 rounded-lg flex items-center gap-2 border border-slate-700 shadow-lg">
            <span className="text-xs font-bold uppercase tracking-widest">Ranking</span><i className="fa-solid fa-trophy"></i>
          </a>
          <button onClick={() => setCurrentView('admin')} className="bg-slate-800 hover:bg-orange-600 text-orange-500 hover:text-white transition-all px-3 py-2 rounded-lg flex items-center gap-2 border border-slate-700 shadow-lg">
            <span className="text-xs font-bold uppercase tracking-widest">Admin</span><i className="fa-solid fa-gear"></i>
          </button>
        </div>
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
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-sm font-bold text-yellow-500 uppercase tracking-wider"><i className="fa-solid fa-trophy mr-1"></i> Lista do Time Campeão</label>
                  <button onClick={() => setShowPlayerSelector('champion')} className="text-xs bg-slate-800 hover:bg-yellow-600 hover:text-white text-yellow-500 px-3 py-1 rounded border border-yellow-500/30 transition-colors font-bold">
                    <i className="fa-solid fa-list"></i> Inserir do Cadastro
                  </button>
                </div>
                <textarea className="w-full h-32 p-4 bg-[#1a1c2e] border-2 border-yellow-500/30 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none resize-none font-mono text-sm text-yellow-100 placeholder-yellow-500/20" placeholder="Cole aqui os 5 nomes... (ex: Nome 7)" value={championText} onChange={(e) => setChampionText(e.target.value)} />
              </div>
            )}
            <div className="mb-6">
              <div className="flex justify-between items-end mb-2">
                <label className="block text-sm font-bold text-slate-300 uppercase tracking-wider">{useChampionMode ? `Lista dos Desafiantes` : `Lista Completa (20 Atletas)`}</label>
                <button onClick={() => setShowPlayerSelector('general')} className="text-xs bg-slate-800 hover:bg-orange-600 hover:text-white text-orange-500 px-3 py-1 rounded border border-orange-500/30 transition-colors font-bold">
                  <i className="fa-solid fa-list"></i> Inserir do Cadastro
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-2">* Dica: Digite "Apelido 7" para puxar o cadastro do jogador #007 automaticamente.</p>
              <textarea className="w-full h-48 p-4 bg-slate-950 border-2 border-slate-800 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none font-mono text-sm text-gray-200 placeholder-slate-700" placeholder={useChampionMode ? "Cole aqui os outros jogadores..." : "Cole a lista completa..."} value={rawText} onChange={(e) => setRawText(e.target.value)} />
            </div>
            <button onClick={handleGenerateList} disabled={!rawText.trim()} className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-all active:scale-95 flex items-center justify-center gap-2">INICIAR CONVOCAÇÃO <i className="fa-solid fa-arrow-right"></i></button>
          </div>
        )}

        {step === 'preview' && (
          <div className="bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-800 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="p-4 md:p-6 bg-slate-900/50 border-b border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-20 backdrop-blur-md">
              <div className="flex items-center gap-4 w-full md:w-auto">
                <button onClick={() => setStep('input')} className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg text-xs md:text-sm font-bold flex items-center gap-2 transition-colors border border-slate-700"><i className="fa-solid fa-arrow-left"></i> Voltar</button>
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-white whitespace-nowrap">Conferir Lista Colada ({previewLines.length})</h2>
                  <p className="text-xs text-slate-500">Confira nome, código e correspondência no cadastro antes de continuar.</p>
                </div>
              </div>
              <button onClick={handleMarkChampions} className="text-xs bg-slate-800 hover:bg-yellow-600 hover:text-white text-yellow-500 px-3 py-2 rounded-lg border border-yellow-500/30 transition-colors font-bold flex items-center gap-2 flex-none">
                <i className="fa-solid fa-crown"></i> Marcar Time Campeão (Últimos 5)
              </button>
            </div>

            {duplicateCodes.length > 0 && (
              <div className="p-4 bg-red-500/10 border-b border-red-500/30">
                <p className="text-sm text-red-300"><i className="fa-solid fa-triangle-exclamation mr-2"></i><strong>Código(s) duplicado(s): {duplicateCodes.join(', ')}</strong> — corrija antes de continuar.</p>
              </div>
            )}

            <div className="divide-y divide-slate-800 max-h-[55vh] overflow-y-auto custom-scrollbar">
              {previewLines.map((line, idx) => {
                const isDuplicate = line.code !== '' && duplicateCodes.includes(line.code);
                return (
                  <div key={line.id} className={`p-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-3 ${line.isChampion ? 'bg-yellow-500/10 border-l-4 border-yellow-500' : isDuplicate ? 'bg-red-500/10 border-l-4 border-red-500' : ''}`}>
                    <span className="text-xs text-slate-600 w-6 flex-none">{idx + 1}</span>
                    <input
                      value={line.name}
                      onChange={e => handleUpdatePreviewLine(line.id, 'name', e.target.value)}
                      className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm focus:border-orange-500 outline-none"
                    />
                    <input
                      value={line.code}
                      onChange={e => handleUpdatePreviewLine(line.id, 'code', e.target.value)}
                      className={`w-full md:w-16 bg-slate-950 border rounded-lg px-2 py-1.5 text-white text-sm text-center outline-none flex-none ${isDuplicate ? 'border-red-500' : 'border-slate-700 focus:border-orange-500'}`}
                    />
                    <span className={`text-xs flex items-center gap-1 flex-1 min-w-0 truncate ${line.matchedName ? 'text-green-400' : 'text-orange-400'}`}>
                      <i className={`fa-solid ${line.matchedName ? 'fa-check' : 'fa-circle-question'}`}></i>
                      {line.matchedName ?? 'Não encontrado no cadastro'}
                    </span>
                    <button
                      onClick={() => handleTogglePreviewChampion(line.id)}
                      title="Marcar/desmarcar como campeão"
                      className={`p-2 rounded-lg flex-none transition-colors ${line.isChampion ? 'text-yellow-400 bg-yellow-500/10' : 'text-slate-600 hover:text-yellow-400 hover:bg-yellow-500/10'}`}
                    >
                      <i className="fa-solid fa-crown"></i>
                    </button>
                  </div>
                );
              })}
            </div>

            {discardedLines.length > 0 && (
              <div className="p-4 md:p-6 border-t border-slate-800 bg-slate-950/50">
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">
                  <i className="fa-solid fa-eye mr-1.5"></i>
                  Linhas descartadas ({discardedLines.length}) — confira se nenhuma era válida:
                </p>
                <ul className="text-xs text-slate-600 space-y-1 max-h-32 overflow-y-auto custom-scrollbar font-mono">
                  {discardedLines.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </div>
            )}

            <div className="p-4 md:p-6 bg-slate-900 border-t border-slate-800">
              {duplicateCodes.length > 0 && (
                <p className="text-xs text-red-400 font-bold text-center mb-3"><i className="fa-solid fa-triangle-exclamation mr-1"></i> Resolva os códigos duplicados antes de continuar.</p>
              )}
              <button
                onClick={handleConfirmPreview}
                disabled={duplicateCodes.length > 0}
                className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                CONFIRMAR E CONTINUAR <i className="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {step === 'classify' && (
          <div className="bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-800 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="p-4 md:p-6 bg-slate-900/50 border-b border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-20 backdrop-blur-md">
              <div className="flex items-center gap-4 w-full md:w-auto">
                <button onClick={() => setStep('input')} className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg text-xs md:text-sm font-bold flex items-center gap-2 transition-colors border border-slate-700"><i className="fa-solid fa-arrow-left"></i> Voltar</button>
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-white whitespace-nowrap">Conferência ({players.length})</h2>
                  <span className={`inline-flex items-center gap-1.5 mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${isLevelBalancingActive ? 'text-orange-400 border-orange-500/40 bg-orange-500/10' : 'text-slate-400 border-slate-700 bg-slate-800'}`}>
                    <i className={`fa-solid ${isLevelBalancingActive ? 'fa-scale-balanced' : 'fa-dice'}`}></i>
                    {isLevelBalancingActive ? 'Balanceamento por Níveis' : 'Balanceamento Padrão'}
                  </span>
                </div>
              </div>
              <button onClick={handleReset} className="text-slate-500 hover:text-red-400 text-xs md:text-sm font-bold uppercase tracking-wider flex items-center gap-1 transition-colors"><i className="fa-solid fa-trash"></i> Limpar Tudo</button>
            </div>
            {unclassifiedPlayers.length > 0 && (
              <div className="p-4 md:p-6 bg-red-500/10 border-b border-red-500/30">
                <p className="text-sm text-red-300">
                  <i className="fa-solid fa-triangle-exclamation mr-2"></i>
                  <strong>{unclassifiedPlayers.length} jogador(es) sem posição definida</strong> — defina a posição (e revise o nível) de cada um destacado abaixo antes de sortear. Para avaliar vários de uma vez, use a página de votação.
                </p>
              </div>
            )}
            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
              {classifyLevelGroups.map(group => group.players.length > 0 && (
                <div key={group.level}>
                  <div className="sticky top-0 z-10 px-4 md:px-6 py-1.5 bg-slate-800/90 backdrop-blur-sm border-y border-slate-700 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center text-[10px] font-black">{group.level}</span>
                    <span className="text-[11px] font-black text-slate-300 uppercase tracking-wider">Nível {group.level}</span>
                    <span className="text-[10px] text-slate-500 font-bold">({group.players.length})</span>
                  </div>
                  <div className="divide-y divide-slate-800">
                    {group.players.map((player) => {
                      const isUnclassified = player.position === 'Não definida';
                      return (
                      <div key={player.id} className={`p-3 md:p-4 flex flex-col gap-3 transition-colors ${isUnclassified ? 'bg-red-500/10 border-l-4 border-red-500' : player.isFixedInTeam1 ? 'bg-yellow-500/10 border-l-4 border-yellow-500' : 'hover:bg-slate-800/50'}`}>
                        <div className="flex items-center gap-2">
                          {player.code !== '---' && <span className="text-[10px] font-mono font-bold bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">#{player.code}</span>}
                          {player.isFixedInTeam1 && <i className="fa-solid fa-crown text-yellow-500" title="Campeão Atual"></i>}
                          <input type="text" value={player.name} onChange={(e) => handleUpdatePlayer(player.id, { name: e.target.value })} className={`w-full bg-transparent font-bold text-lg border-b border-transparent focus:border-orange-500 outline-none truncate ${player.isFixedInTeam1 ? 'text-yellow-100' : 'text-white'}`} />
                          {isUnclassified && <span className="text-[10px] font-bold uppercase text-red-400 border border-red-500/40 rounded px-1.5 py-0.5 flex-none">Sem posição</span>}
                        </div>
                        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                          <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800 overflow-x-auto">
                            {positions.map((pos) => (
                              <button key={pos.id} onClick={() => handleUpdatePlayer(player.id, { position: pos.id })} className={`relative flex items-center gap-1.5 px-3 py-2 rounded-md transition-all duration-200 ${player.position === pos.id ? 'bg-orange-500 text-white shadow-lg scale-105 z-10' : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800'}`}><span className="text-lg md:text-xl">{pos.icon}</span><span className="text-[10px] font-bold uppercase tracking-wider">{pos.label}</span></button>
                            ))}
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">Nível Técnico (1-5)</span>
                            <StarRating rating={player.level} onChange={(level) => handleUpdatePlayer(player.id, { level })} />
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 md:p-6 bg-slate-900 border-t border-slate-800">
              <button onClick={handleSortTeams} disabled={unclassifiedPlayers.length > 0} className="w-full py-4 bg-[#1E3A8A] hover:bg-[#254ab2] disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/10 transition-all active:scale-95 flex items-center justify-center gap-2 border border-blue-700 disabled:border-slate-700">SORTEAR TIMES <i className="fa-solid fa-shuffle"></i></button>
            </div>
          </div>
        )}

        {step === 'groups' && (
          <div className="bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-800 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="p-4 md:p-6 bg-slate-900/50 border-b border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-20 backdrop-blur-md">
              <div className="flex items-center gap-4 w-full md:w-auto">
                <button onClick={() => setStep('classify')} className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg text-xs md:text-sm font-bold flex items-center gap-2 transition-colors border border-slate-700"><i className="fa-solid fa-arrow-left"></i> Voltar</button>
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-white whitespace-nowrap">Grupos de Nível de Sorteio</h2>
                  <p className="text-xs text-slate-500">
                    Ajuste se discordar da recomendação. Cada grupo precisa de exatamente {expectedDrawGroupSize} jogadores.
                    {' '}<span className="text-green-400"><i className="fa-solid fa-arrow-up"></i> promovido</span> ou <span className="text-orange-400"><i className="fa-solid fa-arrow-down"></i> rebaixado</span> vale só para esse sorteio — o nível cadastrado do jogador não muda.
                  </p>
                </div>
              </div>
            </div>

            {championsForGroupsScreen.length > 0 && (
              <div className="p-4 md:p-6 border-b border-slate-800 bg-yellow-500/5">
                <h3 className="text-xs font-bold text-yellow-500 uppercase tracking-wider mb-2 flex items-center gap-2"><i className="fa-solid fa-crown"></i> Time 1 (Campeão) — já definido, fora do sorteio</h3>
                <div className="flex flex-wrap gap-2">
                  {championsForGroupsScreen.map(p => (
                    <span key={p.id} className="text-xs bg-slate-800 text-yellow-100 px-2 py-1 rounded border border-yellow-500/30">{p.name}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 md:p-6 space-y-4 max-h-[55vh] overflow-y-auto custom-scrollbar">
              {drawLevelGroups.map(group => {
                const isGroupBalanced = group.players.length === expectedDrawGroupSize;
                return (
                  <div key={group.level} className={`rounded-xl border p-3 md:p-4 ${isGroupBalanced ? 'border-slate-800 bg-slate-950' : 'border-red-500/50 bg-red-500/5'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-black text-white text-sm uppercase tracking-wider flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs">{group.level}</span>
                        Nível de Sorteio {group.level}
                      </h3>
                      <span className={`text-xs font-bold ${isGroupBalanced ? 'text-slate-500' : 'text-red-400'}`}>{group.players.length}/{expectedDrawGroupSize}</span>
                    </div>
                    <div className="space-y-2">
                      {group.players.map(player => {
                        const drawLevel = player.drawLevel ?? group.level;
                        const hasChanged = drawLevel !== player.level;
                        const isPromoted = drawLevel > player.level;
                        return (
                        <div key={player.id} className="flex items-center justify-between gap-3 bg-slate-900 rounded-lg p-2 border border-slate-800">
                          <div className="min-w-0">
                            <div className="font-bold text-white text-sm truncate flex items-center gap-1.5">
                              {player.name}
                              {historicalAdjustments[player.id] !== undefined && (
                                <i
                                  className="fa-solid fa-chart-line text-sky-400 text-xs"
                                  title={`Posicionado com base no histórico de ajustes (${historicalAdjustments[player.id] > 0 ? '+' : ''}${historicalAdjustments[player.id].toFixed(1)})`}
                                ></i>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1.5 flex-wrap">
                              <span>{player.position}</span>
                              <span className="text-slate-700">•</span>
                              <span className="text-slate-500">Cadastro <span className="text-slate-300">{player.level}</span></span>
                              <i className="fa-solid fa-arrow-right-long text-slate-700 text-[9px]"></i>
                              <span className={`flex items-center gap-1 ${hasChanged ? (isPromoted ? 'text-green-400' : 'text-orange-400') : 'text-slate-500'}`}>
                                Sorteio <span className={hasChanged ? '' : 'text-slate-300'}>{drawLevel}</span>
                                {hasChanged && <i className={`fa-solid ${isPromoted ? 'fa-arrow-up' : 'fa-arrow-down'}`} title={isPromoted ? 'Promovido só para esse sorteio' : 'Rebaixado só para esse sorteio'}></i>}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-1 flex-none">
                            {[1, 2, 3, 4, 5].map(lvl => (
                              <button key={lvl} onClick={() => handleMoveToDrawGroup(player.id, lvl)} className={`w-7 h-7 rounded text-xs font-bold transition-all ${lvl === group.level ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'}`}>{lvl}</button>
                            ))}
                          </div>
                        </div>
                        );
                      })}
                      {group.players.length === 0 && (
                        <p className="text-xs text-slate-600 text-center py-2">Nenhum jogador nesse grupo.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 md:p-6 bg-slate-900 border-t border-slate-800">
              {!isDrawGroupsBalanced && (
                <p className="text-xs text-red-400 font-bold text-center mb-3"><i className="fa-solid fa-triangle-exclamation mr-1"></i> Ajuste os grupos: cada um precisa de exatamente {expectedDrawGroupSize} jogadores antes de sortear.</p>
              )}
              <button onClick={() => finalSort(drawGroups)} disabled={!isDrawGroupsBalanced} className="w-full py-4 bg-[#1E3A8A] hover:bg-[#254ab2] disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/10 transition-all active:scale-95 flex items-center justify-center gap-2 border border-blue-700 disabled:border-slate-700">CONFIRMAR E SORTEAR <i className="fa-solid fa-shuffle"></i></button>
            </div>
          </div>
        )}

        {/* ... (STEP RESULTS - MANTIDO IGUAL) ... */}
        {step === 'results' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl shadow-xl border-l-4 border-orange-500 border border-slate-800 relative">
               <div className="w-full md:w-auto text-center md:text-left">
                 <h2 className="text-2xl font-black text-white italic">Times Definidos!</h2>
                 <p className="text-slate-400 text-sm">Prontos para o jogo.</p>
                 <span className={`inline-flex items-center gap-1.5 mt-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${drawGroups.length > 0 ? 'text-orange-400 border-orange-500/40 bg-orange-500/10' : 'text-slate-400 border-slate-700 bg-slate-800'}`}>
                   <i className={`fa-solid ${drawGroups.length > 0 ? 'fa-scale-balanced' : 'fa-dice'}`}></i>
                   {drawGroups.length > 0 ? 'Balanceamento por Níveis' : 'Balanceamento Padrão'}
                 </span>
               </div>
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
                                {p.code !== '---' && <span className="text-slate-500 text-[10px] font-mono">#{p.code}</span>}
                              </div>
                              <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{p.position}</div>
                            </div>
                            <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                              {p.drawLevel !== undefined && p.drawLevel !== p.level ? (
                                <>
                                  <span className="text-[10px] text-slate-600 line-through" title="Nível cadastrado">{p.level}</span>
                                  <i className={`fa-solid ${p.drawLevel > p.level ? 'fa-arrow-up text-green-400' : 'fa-arrow-down text-orange-400'} text-[9px]`}></i>
                                  <span className={`font-black text-sm ${getLevelColor(p.drawLevel)}`} title="Nível de sorteio">{p.drawLevel}</span>
                                </>
                              ) : (
                                <span className={`font-black text-sm ${getLevelColor(p.level)}`}>{p.level}</span>
                              )}
                              <i className="fa-solid fa-bolt text-[10px] text-slate-600"></i>
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
               <button onClick={() => finalSort(drawGroups)} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2"><i className="fa-solid fa-rotate-right"></i> Refazer Sorteio</button>
               <button onClick={() => setStep('classify')} className="w-full py-3 text-slate-400 hover:text-white font-bold transition-colors text-sm">Voltar e Editar Jogadores</button>
            </div>
          </div>
        )}
      </main>
      <footer className="mt-12 text-center px-4 pb-8 flex flex-col gap-6 items-center">
        <div className="flex flex-wrap justify-center gap-4">
          <a href="?view=ranking" className="text-slate-600 hover:text-orange-500 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2"><i className="fa-solid fa-trophy"></i> Ranking</a>
          <button onClick={() => setCurrentView('admin')} className="text-slate-600 hover:text-orange-500 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2"><i className="fa-solid fa-lock"></i> Acesso Restrito (Admin)</button>
        </div>
        <div className="inline-block relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 to-blue-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
          <p className="relative text-orange-500 font-black text-xl md:text-2xl tracking-tighter uppercase italic drop-shadow-[0_2px_10px_rgba(249,115,22,0.3)] animate-pulse-slow">Desenvolvido por Fabrício Luna</p>
        </div>
      </footer>
    </div>
  );
};

// --- COMPONENTES AUXILIARES ---

const PlayerSelectionModal: React.FC<{ 
  onClose: () => void; 
  onSelect: (p: Player) => void;
  onRemove: (p: Player) => void;
  usedCodes: number[]; 
}> = ({ onClose, onSelect, onRemove, usedCodes }) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    db.getAllPlayers().then(all => {
      setPlayers(all.sort((a, b) => a.name.localeCompare(b.name)));
      setIsLoading(false);
    });
  }, []);

  const filteredPlayers = players.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.code.includes(search)
  );

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
        <div className="p-4 border-b border-slate-800 bg-slate-950 rounded-t-2xl flex justify-between items-center">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <i className="fa-solid fa-address-book text-orange-500"></i> Selecionar Atleta
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><i className="fa-solid fa-xmark text-xl"></i></button>
        </div>
        
        <div className="p-4 bg-slate-950 border-b border-slate-800">
          <input 
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou código..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-orange-500 outline-none"
          />
        </div>

        <div className="overflow-y-auto custom-scrollbar flex-1 p-2">
          {isLoading ? (
            <p className="text-center text-slate-500 py-4"><i className="fa-solid fa-spinner fa-spin"></i></p>
          ) : filteredPlayers.length === 0 ? (
            <p className="text-center text-slate-500 py-4">Nenhum jogador encontrado.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {filteredPlayers.map(p => {
                const isSelected = usedCodes.includes(parseInt(p.code, 10));
                return (
                  <div 
                    key={p.id} 
                    className={`flex items-center gap-3 p-3 rounded-xl transition-colors text-left border ${isSelected ? 'bg-green-900/10 border-green-900/30' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}
                  >
                    <span className={`font-mono text-xs px-1.5 py-0.5 rounded border ${isSelected ? 'bg-green-900 text-green-300 border-green-700' : 'bg-slate-950 text-slate-400 border-slate-700'}`}>#{p.code}</span>
                    <div className="flex-1">
                      <div className={`font-bold transition-colors ${isSelected ? 'text-green-400' : 'text-white'}`}>{p.name}</div>
                      <div className="text-xs text-slate-500">{p.position} • Nível {p.level}</div>
                    </div>
                    {isSelected ? (
                      <div className="flex items-center gap-2">
                        <span className="text-green-500 text-lg animate-in zoom-in"><i className="fa-solid fa-check"></i></span>
                        <button onClick={() => onRemove(p)} className="w-8 h-8 rounded-lg bg-red-900/20 text-red-500 hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center border border-red-900/30" title="Remover"><i className="fa-solid fa-xmark"></i></button>
                      </div>
                    ) : (
                      <button onClick={() => onSelect(p)} className="w-8 h-8 rounded-lg bg-slate-700 text-slate-400 hover:bg-orange-500 hover:text-white transition-colors flex items-center justify-center" title="Adicionar"><i className="fa-solid fa-plus"></i></button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="p-4 bg-slate-950 border-t border-slate-800 rounded-b-2xl text-center">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-white">Concluir Seleção</button>
        </div>
      </div>
    </div>
  );
};

const QuickRegisterRow: React.FC<{ player: Player; onUpdate: (id: string, field: keyof Player, value: any) => void; onSave: () => void }> = ({ player, onUpdate, onSave }) => {
  return (
    <div className="bg-slate-800 p-4 rounded-xl flex flex-col gap-3 border border-slate-700">
      <div className="flex flex-col md:flex-row gap-3">
        <input value={player.name} onChange={(e) => onUpdate(player.id, 'name', e.target.value)} className="flex-1 bg-slate-950 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-orange-500 outline-none" placeholder="Nome do Jogador" />
        <div className="flex gap-2">
          <select value={player.position} onChange={(e) => onUpdate(player.id, 'position', e.target.value)} className="bg-slate-950 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-orange-500 outline-none"><option value="Zagueiro">Zagueiro</option><option value="Meia">Meia</option><option value="Atacante">Atacante</option></select>
          <div className="bg-slate-950 border border-slate-600 rounded-lg px-3 py-2 flex items-center">
            <StarRating rating={player.level} onChange={(level) => onUpdate(player.id, 'level', level)} />
          </div>
        </div>
      </div>
      <button onClick={onSave} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 text-sm"><i className="fa-solid fa-floppy-disk"></i> Salvar no Banco</button>
    </div>
  );
};

export default App;
