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
  
  // Form States
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [position, setPosition] = useState<Position>('Meia');
  const [level, setLevel] = useState(5);

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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    db.savePlayer({
      id: editingId || undefined,
      name,
      position,
      level
    });

    // Reset Form
    setName('');
    setPosition('Meia');
    setLevel(5);
    setEditingId(null);
    loadPlayers();
  };

  const handleEdit = (p: Player) => {
    setName(p.name);
    setPosition(p.position);
    setLevel(p.level);
    setEditingId(p.id);
  };

  const handleDelete = (id: string) => {
    if (confirm('Excluir jogador do cadastro?')) {
      db.deletePlayer(id);
      loadPlayers();
    }
  };

  const getLevelColor = (l: number) => {
    if (l >= 8) return 'text-green-400';
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
        <h3 className="text-orange-500 font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
          {editingId ? <><i className="fa-solid fa-pen"></i> Editar Jogador</> : <><i className="fa-solid fa-plus"></i> Novo Jogador</>}
        </h3>
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-5">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Nome</label>
            <input 
              value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none"
              placeholder="Ex: João Silva" required
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Posição</label>
            <select 
              value={position} onChange={e => setPosition(e.target.value as Position)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none"
            >
              <option value="Zagueiro">Zagueiro</option>
              <option value="Meia">Meia</option>
              <option value="Atacante">Atacante</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Nível (1-10)</label>
            <input 
              type="number" min="1" max="10"
              value={level} onChange={e => setLevel(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none text-center"
            />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg shadow-lg">
              {editingId ? 'ATUALIZAR' : 'CADASTRAR'}
            </button>
          </div>
        </form>
        {editingId && (
          <button onClick={() => { setEditingId(null); setName(''); setLevel(5); }} className="mt-2 text-xs text-red-400 hover:underline">
            Cancelar Edição
          </button>
        )}
      </div>

      {/* LISTA DE JOGADORES */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
          <span className="font-bold text-slate-400 text-sm uppercase">Atletas Cadastrados ({players.length})</span>
        </div>
        <div className="divide-y divide-slate-800 max-h-[500px] overflow-y-auto">
          {players.map(p => (
            <div key={p.id} className="p-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors group">
              <div className="flex items-center gap-4">
                <div className="bg-slate-800 text-slate-400 px-2 py-1 rounded text-xs font-mono font-bold border border-slate-700">
                  #{p.code}
                </div>
                <div>
                  <div className="font-bold text-white">{p.name}</div>
                  <div className="text-xs text-slate-500 uppercase font-bold flex gap-2">
                    <span>{p.position}</span>
                    <span className="text-slate-700">•</span>
                    <span className={getLevelColor(p.level)}>Nível {p.level}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(p)} className="p-2 text-blue-400 hover:bg-blue-400/10 rounded-lg" title="Editar">
                  <i className="fa-solid fa-pen"></i>
                </button>
                <button onClick={() => handleDelete(p.id)} className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg" title="Excluir">
                  <i className="fa-solid fa-trash"></i>
                </button>
              </div>
            </div>
          ))}
          {players.length === 0 && (
            <div className="p-8 text-center text-slate-500">Nenhum jogador cadastrado ainda.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
