export type Position = 'Zagueiro' | 'Meia' | 'Atacante' | 'Não definida';

export interface Player {
  id: string;
  code: string; // Código de 3 dígitos (ex: 042)
  name: string;
  position: Position;
  level: number; // 1 a 5 (estrelas)
  redCards: number; // total de cartões vermelhos (histórico de peladas)
  goals: number; // total de gols (histórico de peladas)
  yellowCards?: number; // total de cartões amarelos (histórico de peladas)
  titles?: number; // quantidade de peladas em que esteve no time campeão
  // Propriedades usadas apenas durante o sorteio
  isFixedInTeam1?: boolean;
  isPresent?: boolean; // Para marcar presença na lista do sorteio
  drawLevel?: number; // Nível de sorteio (1-5), final (após ajuste manual) — temporário, nunca é salvo no cadastro
  suggestedDrawLevel?: number; // Nível de sorteio sugerido pelo algoritmo, antes de qualquer ajuste manual — temporário
}

export interface Team {
  id: number;
  name: string;
  players: Player[];
  totalLevel: number;
}

export type AppStep = 'input' | 'classify' | 'groups' | 'results';

// Voto de um jogador sobre o nível/posição de outro jogador (levantamento para a diretoria)
export interface Vote {
  id: string; // `${playerId}_${voterKey}`
  playerId: string;
  voterName: string;
  level: number; // 1 a 5
  position: Position;
  updatedAt: number;
}

// Resultado de um jogador dentro de uma pelada específica.
export interface PeladaPlayerResult {
  playerId: string;
  name: string;
  code: string;
  goals: number;
  yellowCards: number;
  redCards: number;
  registeredLevel: number; // Nível cadastrado do jogador no momento do sorteio
  suggestedLevel?: number; // Nível de sorteio sugerido pelo algoritmo (só quando passou pelo balanceamento por níveis)
  finalLevel?: number; // Nível de sorteio final, após eventual ajuste manual na tela de grupos
}

export interface PeladaTeam {
  id: number;
  name: string;
  players: PeladaPlayerResult[];
}

export type PeladaStatus = 'pendente' | 'concluída';

// Registro de uma pelada (um dia de jogo). O id do documento no Firestore é a própria data (AAAA-MM-DD).
export interface Pelada {
  id: string; // = date
  date: string; // AAAA-MM-DD
  status: PeladaStatus;
  teams: PeladaTeam[];
  championTeamId?: number;
  createdAt: number;
  updatedAt: number;
}
