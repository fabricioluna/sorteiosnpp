import { Player } from '../types';

const DB_KEY = 'snpp_db_players';

// Gera o próximo código sequencial (Ex: 001, 002...)
const generateCode = (existingPlayers: Player[]): string => {
  const codes = existingPlayers
    .map(p => parseInt(p.code, 10))
    .filter(n => !isNaN(n));

  if (codes.length === 0) return '001';

  const maxCode = Math.max(...codes);
  const nextCode = maxCode + 1;

  return nextCode.toString().padStart(3, '0');
};

export const db = {
  getAllPlayers: (): Player[] => {
    const data = localStorage.getItem(DB_KEY);
    return data ? JSON.parse(data) : [];
  },

  // FUNÇÃO DE CRIAÇÃO (Novo Jogador)
  addPlayer: (player: Omit<Player, 'id' | 'code' | 'redCards' | 'goals'>) => {
    const players = db.getAllPlayers();
    
    const newPlayer: Player = {
      id: `db-${Date.now()}`,
      code: generateCode(players),
      name: player.name,
      position: player.position,
      level: player.level,
      redCards: 0,
      goals: 0
    };
    
    players.push(newPlayer);
    localStorage.setItem(DB_KEY, JSON.stringify(players));
  },

  // FUNÇÃO DE ATUALIZAÇÃO (Editar Existente)
  updatePlayer: (id: string, updates: Partial<Omit<Player, 'id' | 'code'>>) => {
    const players = db.getAllPlayers();
    const updatedPlayers = players.map(p => {
      if (p.id === id) {
        // Mantém ID, Código, Cartões e Gols originais. Atualiza apenas o resto.
        return { ...p, ...updates };
      }
      return p;
    });
    localStorage.setItem(DB_KEY, JSON.stringify(updatedPlayers));
  },

  deletePlayer: (id: string) => {
    const players = db.getAllPlayers().filter(p => p.id !== id);
    localStorage.setItem(DB_KEY, JSON.stringify(players));
  },

  findByName: (name: string): Player | undefined => {
    const players = db.getAllPlayers();
    return players.find(p => p.name.toLowerCase() === name.toLowerCase());
  },

  findByCode: (code: string): Player | undefined => {
    const players = db.getAllPlayers();
    return players.find(p => p.code === code);
  }
};
