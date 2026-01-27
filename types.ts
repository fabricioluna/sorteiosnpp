
export type Position = 'Zagueiro' | 'Meia' | 'Atacante';

export interface Player {
  id: string;
  name: string;
  position: Position;
  level: number;
}

export interface Team {
  id: number;
  name: string;
  players: Player[];
  totalLevel: number;
}

export type AppStep = 'input' | 'classify' | 'results';
