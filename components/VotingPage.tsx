import React, { useState, useEffect } from 'react';
import { Player, Position, Vote } from '../types';
import { db } from '../utils/database';
import { votesDb } from '../utils/votes';
import StarRating from './StarRating';

const VOTER_NAME_KEY = 'snpp_voter_name';

const positions: { id: Position; icon: string; label: string }[] = [
  { id: 'Zagueiro', icon: '🛡️', label: 'Zag' },
  { id: 'Meia', icon: '🎯', label: 'Meia' },
  { id: 'Atacante', icon: '🚀', label: 'Ata' },
];

const VotingPage: React.FC = () => {
  const [voterName, setVoterName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, { level: number; position: Position }>>({});
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const saved = localStorage.getItem(VOTER_NAME_KEY);
    if (saved) setVoterName(saved);
  }, []);

  useEffect(() => {
    if (!voterName) return;

    const load = async () => {
      setIsLoading(true);
      const [allPlayers, allVotes] = await Promise.all([db.getAllPlayers(), votesDb.getAllVotes()]);
      const sorted = allPlayers.sort((a, b) => a.name.localeCompare(b.name));
      setPlayers(sorted);

      const normalizedVoter = voterName.trim().toLowerCase();
      const myExistingVotes = allVotes.filter((v: Vote) => v.voterName.trim().toLowerCase() === normalizedVoter);

      const votesMap: Record<string, { level: number; position: Position }> = {};
      const submitted = new Set<string>();
      sorted.forEach(p => {
        const existing = myExistingVotes.find(v => v.playerId === p.id);
        if (existing) {
          votesMap[p.id] = { level: existing.level, position: existing.position };
          submitted.add(p.id);
        } else {
          votesMap[p.id] = { level: p.level, position: p.position === 'Não definida' ? 'Meia' : p.position };
        }
      });
      setMyVotes(votesMap);
      setSubmittedIds(submitted);
      setIsLoading(false);
    };

    load();
  }, [voterName]);

  const handleStartVoting = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    localStorage.setItem(VOTER_NAME_KEY, nameInput.trim());
    setVoterName(nameInput.trim());
  };

  const handleVote = async (playerId: string, updates: Partial<{ level: number; position: Position }>) => {
    const next = { ...myVotes[playerId], ...updates };
    setMyVotes(prev => ({ ...prev, [playerId]: next }));
    await votesDb.submitVote(playerId, voterName, next.level, next.position);
    setSubmittedIds(prev => new Set(prev).add(playerId));
  };

  if (!voterName) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] animate-in fade-in">
        <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl w-full max-w-sm">
          <h2 className="text-2xl font-black text-white mb-2 text-center uppercase italic">
            Votação da Pelada
          </h2>
          <p className="text-slate-400 text-sm text-center mb-6">
            Avalie o nível técnico e a posição dos atletas para ajudar a diretoria a decidir.
          </p>
          <form onSubmit={handleStartVoting} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Seu nome</label>
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none"
                placeholder="Ex: João Silva"
              />
            </div>
            <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-lg transition-colors">
              COMEÇAR A VOTAR
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300 pb-12">
      <div className="text-center py-6">
        <h2 className="text-2xl font-black text-white uppercase italic">Votação da Pelada</h2>
        <p className="text-slate-400 text-sm mt-1">
          Votando como <span className="text-orange-500 font-bold">{voterName}</span> ·{' '}
          <button
            onClick={() => { localStorage.removeItem(VOTER_NAME_KEY); setVoterName(''); }}
            className="underline hover:text-white"
          >
            trocar nome
          </button>
        </p>
        <p className="text-xs text-slate-500 mt-2">
          {submittedIds.size} de {players.length} atletas avaliados
        </p>
      </div>

      {isLoading ? (
        <div className="text-center text-slate-500 py-12"><i className="fa-solid fa-spinner fa-spin text-3xl"></i></div>
      ) : players.length === 0 ? (
        <div className="text-center text-slate-500 py-12">Nenhum atleta cadastrado ainda.</div>
      ) : (
        <div className="space-y-3">
          {players.map(p => {
            const vote = myVotes[p.id];
            const isSubmitted = submittedIds.has(p.id);
            return (
              <div key={p.id} className={`bg-slate-900 rounded-2xl border p-4 flex flex-col gap-3 transition-colors ${isSubmitted ? 'border-green-800/50' : 'border-slate-800'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-lg">{p.name}</span>
                  {isSubmitted && <i className="fa-solid fa-circle-check text-green-500"></i>}
                </div>
                <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                  <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800 overflow-x-auto">
                    {positions.map(pos => (
                      <button
                        key={pos.id}
                        onClick={() => handleVote(p.id, { position: pos.id })}
                        className={`relative flex items-center gap-1.5 px-3 py-2 rounded-md transition-all duration-200 ${vote?.position === pos.id ? 'bg-orange-500 text-white shadow-lg scale-105 z-10' : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800'}`}
                      >
                        <span className="text-lg">{pos.icon}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider">{pos.label}</span>
                      </button>
                    ))}
                  </div>
                  <StarRating rating={vote?.level ?? 3} onChange={(level) => handleVote(p.id, { level })} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VotingPage;
