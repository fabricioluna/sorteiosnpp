export type Position = 'Zagueiro' | 'Meia' | 'Atacante' | 'Não definida';

export interface Player {
  id: string;
  code: string; // Código de 3 dígitos (ex: 042)
  name: string;
  position: Position;
  level: number; // 1 a 5 (estrelas)
  redCards: number;
  goals: number;
  // Propriedades usadas apenas durante o sorteio
  isFixedInTeam1?: boolean;
  isPresent?: boolean; // Para marcar presença na lista do sorteio
}

export interface Team {
  id: number;
  name: string;
  players: Player[];
  totalLevel: number;
}

export type AppStep = 'input' | 'classify' | 'results';

// Voto de um jogador sobre o nível/posição de outro jogador (levantamento para a diretoria)
export interface Vote {
  id: string; // `${playerId}_${voterKey}`
  playerId: string;
  voterName: string;
  level: number; // 1 a 5
  position: Position;
  updatedAt: number;
}
