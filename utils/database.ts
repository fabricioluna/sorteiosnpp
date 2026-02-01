import { Player } from '../types';

const DB_KEY = 'snpp_db_players';

// Gera um código de 3 dígitos único
const generateCode = (existingPlayers: Player[]): string => {
  let newCode = '';
  let isUnique = false;
  while (!isUnique) {
    newCode = Math.floor(100 + Math.random() * 900).toString(); // Gera entre 100 e 999
    isUnique = !existingPlayers.some(p => p.code === newCode);
  }
  return newCode;
};

export const db = {
  getAllPlayers: (): Player[] => {
    const data = localStorage.getItem(DB_KEY);
    return data ? JSON.parse(data) : [];
  },

  savePlayer: (player: Omit<Player, 'id' | 'code' | 'redCards' | 'goals'> & Partial<Player>) => {
    const players = db.getAllPlayers();
    
    if (player.id) {
      // Editar existente
      const updated = players.map(p => p.id === player.id ? { ...p, ...player } : p);
      localStorage.setItem(DB_KEY, JSON.stringify(updated));
    } else {
      // Criar novo
      const newPlayer: Player = {
        id: `db-${Date.now()}`,
        code: generateCode(players),
        name: player.name,
        position: player.position,
        level: player.level,
        redCards: 0,
        goals: 0,
        ...player
      };
      players.push(newPlayer);
      localStorage.setItem(DB_KEY, JSON.stringify(players));
    }
  },

  deletePlayer: (id: string) => {
    const players = db.getAllPlayers().filter(p => p.id !== id);
    localStorage.setItem(DB_KEY, JSON.stringify(players));
  },

  // Busca jogadores pelo nome (para integrar com a lista do WhatsApp)
  findByName: (name: string): Player | undefined => {
    const players = db.getAllPlayers();
    return players.find(p => p.name.toLowerCase() === name.toLowerCase());
  }
};
