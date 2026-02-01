import { Player } from '../types';

const DB_KEY = 'snpp_db_players';

// Gera o próximo código sequencial (Ex: 001, 002...)
const generateCode = (existingPlayers: Player[]): string => {
  // Filtra apenas os códigos que são números
  const codes = existingPlayers
    .map(p => parseInt(p.code, 10))
    .filter(n => !isNaN(n));

  // Se não houver ninguém, começa do 001
  if (codes.length === 0) return '001';

  // Pega o maior número e soma 1
  const maxCode = Math.max(...codes);
  const nextCode = maxCode + 1;

  // Formata para ter sempre 3 dígitos (ex: 5 vira "005")
  return nextCode.toString().padStart(3, '0');
};

export const db = {
  getAllPlayers: (): Player[] => {
    const data = localStorage.getItem(DB_KEY);
    return data ? JSON.parse(data) : [];
  },

  savePlayer: (player: Omit<Player, 'id' | 'code' | 'redCards' | 'goals'> & Partial<Player>) => {
    const players = db.getAllPlayers();
    
    if (player.id) {
      // Editar existente (Mantém o código original)
      const updated = players.map(p => p.id === player.id ? { ...p, ...player } : p);
      localStorage.setItem(DB_KEY, JSON.stringify(updated));
    } else {
      // Criar novo (Gera código sequencial)
      const newPlayer: Player = {
        id: `db-${Date.now()}`,
        code: generateCode(players), // Lógica sequencial aplicada aqui
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

  findByName: (name: string): Player | undefined => {
    const players = db.getAllPlayers();
    return players.find(p => p.name.toLowerCase() === name.toLowerCase());
  }
};
