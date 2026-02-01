import React, { useState, useEffect } from 'react';
import { Player, Position } from '../types';
import { db } from '../utils/database';

interface AdminPanelProps {
  onBack: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  
  // Estado para NOVO Jogador
  const [newName, setNewName] = useState('');
  const [newPosition, setNewPosition] = useState<Position>('Meia');
  const [newLevel, setNewLevel] = useState(5);

  // Estado para EDIÇÃO INLINE
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPosition, setEditPosition] = useState<Position>('Meia');
  const [editLevel, setEditLevel] = useState(5);

  useEffect(() => {
    if (isAuthenticated) loadPlayers();
  }, [isAuthenticated]);

  const loadPlayers = () => {
    setPlayers(db.getAllPlayers().sort((a, b) => a.name.localeCompare(b.name)));
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'snpp2026') {
      setIsAuthenticated(true);
    } else {
      alert('Senha incorreta!');
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    db.addPlayer({
      name: newName,
      position: newPosition,
      level: newLevel
    });

    setNewName('');
    setNewPosition('Meia');
    setNewLevel(5);
    loadPlayers();
  };

  const startEditing = (p: Player) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditPosition(p.position);
    setEditLevel(p.level);
  };

  const saveEditing = () => {
    if (editingId && editName.trim()) {
      db.updatePlayer(editingId, {
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

  // CORREÇÃO: Atualiza o estado visual imediatamente após deletar
  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este jogador do cadastro?')) {
      // 1. Remove do banco
      db.deletePlayer(id);
      
      // 2. Remove da tela instantaneamente (sem esperar recarregar)
      setPlayers(prev => prev.filter(p => p.id !== id));
      
      // 3. Se estiver editando este jogador, cancela a edição
      if (editingId === id) {
        setEditingId(null);
      }
    }
  };

  const getLevelColor = (l: number) => {
    if (l >= 9) return 'text-purple-400';
    if (l >= 7) return 'text-green-400';
    if (l >= 5) return 'text-yellow-400';
    return 'text-red-400';
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
        <button onClick={onBack} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-700">
          <i className="fa-solid fa-arrow-left mr-2"></i> Voltar
        </button>
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
            <input 
              type="number" min="1" max="10"
              value={newLevel} onChange={e => setNewLevel(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none text-center"
            />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg shadow-lg">
              CADASTRAR
            </button>
          </div>
        </form>
      </div>

      {/* LISTA DE JOGADORES */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
          <span className="font-bold text-slate-400 text-sm uppercase">Atletas Cadastrados ({players.length})</span>
        </div>
        <div className="divide-y divide-slate-800 max-h-[500px] overflow-y-auto custom-scrollbar">
          {players.map(p => (
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
                      <option value="Zagueiro">Zagueiro</option>
                      <option value="Meia">Meia</option>
                      <option value="Atacante">Atacante</option>
                    </select>
                    <div className="flex items-center gap-2">
                        <input 
                        type="number" min="1" max="10"
                        value={editLevel} 
                        onChange={e => setEditLevel(Number(e.target.value))}
                        className="bg-slate-950 border border-blue-500 rounded px-2 py-1 text-white focus:outline-none w-16 text-center"
                        />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="font-bold text-white text-lg">{p.name}</div>
                    <div className="text-xs text-slate-500 uppercase font-bold flex gap-2 items-center">
                      <span className="bg-slate-800 px-1.5 rounded">{p.position}</span>
                      <span className="text-slate-700">•</span>
                      <span className={getLevelColor(p.level)}>Nível {p.level}</span>
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
          ))}
          {players.length === 0 && (
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
