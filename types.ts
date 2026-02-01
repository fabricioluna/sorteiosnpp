export type Position = 'Zagueiro' | 'Meia' | 'Atacante';

export interface Player {
  id: string;
  code: string; // Código de 3 dígitos (ex: 042)
  name: string;
  position: Position;
  level: number; // 1 a 10
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
