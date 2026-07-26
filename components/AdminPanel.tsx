import React, { useState, useEffect } from 'react';
import { Player, Position } from '../types';
import { db } from '../utils/database';
import { votesDb, summarizeVotes, VoteSummary } from '../utils/votes';
import StarRating from './StarRating';

interface AdminPanelProps {
  onBack: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Estado para NOVO Jogador
  const [newName, setNewName] = useState('');
  const [newPosition, setNewPosition] = useState<Position>('Meia');
  const [newLevel, setNewLevel] = useState(3);

  // Estado para EDIÇÃO INLINE
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPosition, setEditPosition] = useState<Position>('Meia');
  const [editLevel, setEditLevel] = useState(3);

  // Estado para IMPORTAÇÃO EM LOTE
  const [importText, setImportText] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSummary, setImportSummary] = useState<string | null>(null);

  // Estado para ORDENAÇÃO da lista
  const [sortBy, setSortBy] = useState<'name' | 'code'>('name');

  // Estado para RESULTADOS DA VOTAÇÃO
  const [voteSummary, setVoteSummary] = useState<Record<string, VoteSummary>>({});
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadPlayers();
      loadVoteSummary();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) loadPlayers();
  }, [sortBy]);

  const loadPlayers = async () => {
    setIsLoading(true);
    const all = await db.getAllPlayers();
    const sorted = sortBy === 'name'
      ? all.sort((a, b) => a.name.localeCompare(b.name))
      : all.sort((a, b) => a.code.localeCompare(b.code));
    setPlayers(sorted);
    setIsLoading(false);
  };

  const loadVoteSummary = async () => {
    const votes = await votesDb.getAllVotes();
    setVoteSummary(summarizeVotes(votes));
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'snpp2026') {
      setIsAuthenticated(true);
    } else {
      alert('Senha incorreta!');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    await db.addPlayer({
      name: newName,
      position: newPosition,
      level: newLevel
    });

    setNewName('');
    setNewPosition('Meia');
    setNewLevel(3);
    loadPlayers();
  };

  const startEditing = (p: Player) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditPosition(p.position);
    setEditLevel(p.level);
  };

  const saveEditing = async () => {
    if (editingId && editName.trim()) {
      await db.updatePlayer(editingId, {
        name: editName,
        position: editPosition,
        level: editLevel
      });
      setEditingId(null);
      loadPlayers();
    }
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este jogador do cadastro?')) {
      await db.deletePlayer(id);
      setPlayers(currentPlayers => currentPlayers.filter(p => p.id !== id));
      if (editingId === id) {
        setEditingId(null);
      }
    }
  };

  const handleClearAll = async () => {
    if (confirm('Isso vai apagar TODOS os jogadores cadastrados. Essa ação não pode ser desfeita. Continuar?')) {
      await db.clearAll();
      setPlayers([]);
      setEditingId(null);
    }
  };

  const handleApplyVote = async (player: Player, summary: VoteSummary) => {
    const level = Math.round(summary.avgLevel) as Player['level'];
    const updates: Partial<Player> = { level };
    if (summary.topPosition) updates.position = summary.topPosition;
    await db.updatePlayer(player.id, updates);
    loadPlayers();
  };

  // Aplica a média dos votos (arredondada ao inteiro mais próximo, igual ao "aplicar ao cadastro"
  // individual) a todo jogador que tenha ao menos 1 voto. Quem não recebeu voto fica intocado.
  const handleApplyAllVotes = async () => {
    const entries = Object.entries(voteSummary);
    if (entries.length === 0) return;
    if (!confirm(`Isso vai atualizar nível e posição de ${entries.length} jogador(es) com base na média dos votos (arredondada ao inteiro mais próximo). Continuar?`)) return;

    await Promise.all(entries.map(([playerId, summary]: [string, VoteSummary]) => {
      const updates: Partial<Player> = { level: Math.round(summary.avgLevel) as Player['level'] };
      if (summary.topPosition) updates.position = summary.topPosition;
      return db.updatePlayer(playerId, updates);
    }));

    loadPlayers();
  };

  const handleClearVotes = async () => {
    if (confirm('Isso vai apagar TODOS os votos registrados. Use antes de começar uma nova rodada de levantamento. Continuar?')) {
      await votesDb.clearAllVotes();
      loadVoteSummary();
    }
  };

  const handleCopyVoteLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?view=votacao`;
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  // Aceita duas formas de linha:
  //   "Nome Número"  -> usa o número como código oficial do jogador
  //   "Nome"         -> gera o próximo código oficial disponível (mesma sequência do cadastro manual, a partir de 001)
  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = importText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;

    const usedCodes = new Set((await db.getAllPlayers()).map(p => p.code));
    const errors: string[] = [];
    let importedCount = 0;

    for (const line of lines) {
      const tokens = line.split(/\s+/);
      const lastToken = tokens[tokens.length - 1];
      const hasExplicitCode = tokens.length > 1 && /^\d+$/.test(lastToken);

      const name = (hasExplicitCode ? tokens.slice(0, -1).join(' ') : line).trim();
      if (!name) {
        errors.push(`"${line}" — nome vazio`);
        continue;
      }

      if (hasExplicitCode) {
        const code = lastToken.padStart(3, '0');
        if (usedCodes.has(code)) {
          errors.push(`"${line}" — código #${code} já está em uso`);
          continue;
        }
        await db.addPlayerWithCode({ name, code, position: 'Não definida', level: 3 });
        usedCodes.add(code);
      } else {
        const newPlayer = await db.addPlayer({ name, position: 'Não definida', level: 3 });
        usedCodes.add(newPlayer.code);
      }

      importedCount++;
    }

    setImportErrors(errors);
    setImportSummary(`${importedCount} jogador(es) importado(s).${errors.length > 0 ? ` ${errors.length} linha(s) com erro.` : ''}`);
    setImportText('');
    loadPlayers();
  };

  const getLevelColor = (l: number) => {
    if (l >= 5) return 'text-purple-400';
    if (l >= 4) return 'text-green-400';
    if (l >= 3) return 'text-yellow-400';
    return 'text-red-400';
  };

  const handleExportCSV = () => {
    const header = ['Código', 'Nome', 'Posição', 'Nível'];
    const rows = players.map(p => [p.code, p.name, p.position, String(p.level)]);
    const csv = [header, ...rows]
      .map(row => row.map(field => `"${field.replace(/"/g, '""')}"`).join(';'))
      .join('\n');

    const bom = String.fromCharCode(0xFEFF);
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `elenco_snpp_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] animate-in fade-in">
        <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl w-full max-w-sm">
          <h2 className="text-2xl font-black text-white mb-6 text-center uppercase italic">
            Área Restrita
          </h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Senha de Acesso</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none"
                placeholder="••••••••"
              />
            </div>
            <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-lg transition-colors">
              ENTRAR
            </button>
            <button type="button" onClick={onBack} className="w-full text-slate-500 hover:text-white text-sm py-2">
              Voltar ao Sorteio
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in slide-in-from-right duration-300">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black text-white italic">Gestão de Elenco</h2>
        <div className="flex gap-2">
          <button onClick={handleClearAll} className="bg-red-900/30 text-red-400 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-600 hover:text-white transition-colors border border-red-900/50">
            <i className="fa-solid fa-trash mr-2"></i> Zerar Cadastro
          </button>
          <button onClick={onBack} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-700">
            <i className="fa-solid fa-arrow-left mr-2"></i> Voltar
          </button>
        </div>
      </div>

      {/* LINK DE VOTAÇÃO */}
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 mb-8 shadow-xl">
        <h3 className="text-yellow-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
          <i className="fa-solid fa-square-poll-vertical"></i> Página de Votação
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Compartilhe este link com os jogadores para eles votarem no nível e na posição uns dos outros.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCopyVoteLink}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            <i className={`fa-solid ${linkCopied ? 'fa-check' : 'fa-link'}`}></i> {linkCopied ? 'Link copiado!' : 'Copiar link de votação'}
          </button>
          <button
            onClick={handleApplyAllVotes}
            disabled={Object.keys(voteSummary).length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white font-bold rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            <i className="fa-solid fa-users-gear"></i> Atualizar Todos com a Votação
          </button>
          <button
            onClick={handleClearVotes}
            className="px-4 py-2 bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white font-bold rounded-lg text-sm transition-colors flex items-center gap-2 border border-slate-700"
          >
            <i className="fa-solid fa-broom"></i> Zerar Votos
          </button>
        </div>
        {Object.keys(voteSummary).length > 0 && (
          <p className="text-xs text-slate-500 mt-3">
            {Object.keys(voteSummary).length} de {players.length} atletas têm voto registrado. Nível é arredondado ao inteiro mais próximo (ex: média 3.4 → 3; média 3.5 → 4).
          </p>
        )}
      </div>

      {/* FORMULÁRIO DE CADASTRO */}
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 mb-8 shadow-xl">
        <h3 className="text-green-500 font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
          <i className="fa-solid fa-user-plus"></i> Novo Cadastro
        </h3>
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-5">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Nome</label>
            <input
              value={newName} onChange={e => setNewName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none"
              placeholder="Ex: João Silva" required
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Posição</label>
            <select
              value={newPosition} onChange={e => setNewPosition(e.target.value as Position)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none"
            >
              <option value="Zagueiro">Zagueiro</option>
              <option value="Meia">Meia</option>
              <option value="Atacante">Atacante</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Nível</label>
            <div className="bg-slate-950 border border-slate-700 rounded-lg p-3 flex items-center justify-center">
              <StarRating rating={newLevel} onChange={setNewLevel} />
            </div>
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg shadow-lg">
              CADASTRAR
            </button>
          </div>
        </form>
      </div>

      {/* IMPORTAÇÃO EM LOTE */}
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 mb-8 shadow-xl">
        <h3 className="text-blue-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
          <i className="fa-solid fa-file-import"></i> Importar Lista
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Um jogador por linha. Use <code className="bg-slate-950 px-1 rounded">Nome Número</code> quando souber o código do jogador (ex: "Fabrício 7"),
          ou apenas <code className="bg-slate-950 px-1 rounded">Nome</code> para gerar automaticamente o próximo código oficial disponível.
        </p>
        <form onSubmit={handleImport} className="space-y-3">
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            className="w-full h-40 p-3 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-sm focus:border-blue-500 outline-none resize-none"
            placeholder={'Fabrício 7\nJoão 8\nJosé 34\nPatrick'}
          />
          <button type="submit" disabled={!importText.trim()} className="w-full md:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-lg transition-colors">
            <i className="fa-solid fa-upload mr-2"></i> Importar
          </button>
        </form>

        {importSummary && (
          <div className="mt-4 text-sm font-bold text-green-400">{importSummary}</div>
        )}
        {importErrors.length > 0 && (
          <div className="mt-2 bg-red-950/40 border border-red-900/50 rounded-lg p-3">
            <p className="text-xs font-bold text-red-400 uppercase mb-2">Linhas com erro:</p>
            <ul className="text-xs text-red-300 space-y-1 list-disc list-inside">
              {importErrors.map((err, idx) => <li key={idx}>{err}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* LISTA DE JOGADORES */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <span className="font-bold text-slate-400 text-sm uppercase">Atletas Cadastrados ({players.length})</span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
              <button
                onClick={() => setSortBy('name')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-colors ${sortBy === 'name' ? 'bg-orange-500 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Nome
              </button>
              <button
                onClick={() => setSortBy('code')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-colors ${sortBy === 'code' ? 'bg-orange-500 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Número
              </button>
            </div>
            <button
              onClick={handleExportCSV}
              disabled={players.length === 0}
              className="px-3 py-1.5 bg-slate-800 hover:bg-blue-600 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors flex items-center gap-1.5 border border-slate-700"
            >
              <i className="fa-solid fa-file-export"></i> Exportar CSV
            </button>
          </div>
        </div>
        <div className="divide-y divide-slate-800 max-h-[500px] overflow-y-auto custom-scrollbar">
          {isLoading && (
            <div className="p-12 text-center text-slate-500">
              <i className="fa-solid fa-spinner fa-spin text-2xl"></i>
            </div>
          )}
          {!isLoading && players.map(p => {
            const summary = voteSummary[p.id];
            return (
            <div key={p.id} className={`p-4 flex items-center justify-between transition-colors group ${editingId === p.id ? 'bg-blue-900/20 border-l-2 border-blue-500' : 'hover:bg-slate-800/50'}`}>

              <div className="flex items-center gap-4 flex-1 mr-4">
                <div className="bg-slate-800 text-slate-400 px-2 py-1 rounded text-xs font-mono font-bold border border-slate-700 min-w-[3rem] text-center">
                  #{p.code}
                </div>

                {editingId === p.id ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 w-full animate-in fade-in">
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="bg-slate-950 border border-blue-500 rounded px-2 py-1 text-white focus:outline-none w-full"
                      autoFocus
                    />
                    <select
                      value={editPosition}
                      onChange={e => setEditPosition(e.target.value as Position)}
                      className="bg-slate-950 border border-blue-500 rounded px-2 py-1 text-white focus:outline-none"
                    >
                      <option value="Não definida">Não definida</option>
                      <option value="Zagueiro">Zagueiro</option>
                      <option value="Meia">Meia</option>
                      <option value="Atacante">Atacante</option>
                    </select>
                    <div className="flex items-center gap-2">
                        <StarRating rating={editLevel} onChange={setEditLevel} />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="font-bold text-white text-lg">{p.name}</div>
                    <div className="text-xs text-slate-500 uppercase font-bold flex gap-2 items-center flex-wrap">
                      <span className="bg-slate-800 px-1.5 rounded">{p.position}</span>
                      <span className="text-slate-700">•</span>
                      <span className={getLevelColor(p.level)}>Nível {p.level}</span>
                      {summary && (
                        <>
                          <span className="text-slate-700">•</span>
                          <span className="text-yellow-500 normal-case font-semibold flex items-center gap-1">
                            <i className="fa-solid fa-square-poll-vertical"></i>
                            {summary.voteCount} voto(s): média {summary.avgLevel} • {summary.topPosition}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleApplyVote(p, summary)}
                            className="text-blue-400 hover:text-blue-300 normal-case underline"
                          >
                            aplicar ao cadastro
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {editingId === p.id ? (
                  <>
                    <button onClick={saveEditing} className="p-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors shadow-lg"><i className="fa-solid fa-check"></i></button>
                    <button onClick={cancelEditing} className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"><i className="fa-solid fa-xmark"></i></button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEditing(p)} className="p-2 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"><i className="fa-solid fa-pen-to-square text-lg"></i></button>
                    <button onClick={() => handleDelete(p.id)} className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><i className="fa-solid fa-trash"></i></button>
                  </>
                )}
              </div>
            </div>
            );
          })}
          {!isLoading && players.length === 0 && (
            <div className="p-12 text-center flex flex-col items-center gap-3">
              <i className="fa-solid fa-users-slash text-4xl text-slate-700"></i>
              <p className="text-slate-500">Nenhum jogador cadastrado ainda.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
