import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, increment } from 'firebase/firestore';
import { firestore } from './firebase';
import { Pelada, PeladaTeam, PeladaPlayerResult, Team } from '../types';

const PELADAS_COLLECTION = 'peladas';
const PLAYERS_COLLECTION = 'players';

const teamsToPeladaTeams = (teams: Team[]): PeladaTeam[] =>
  teams
    .filter(t => t.players.length > 0)
    .map(t => ({
      id: t.id,
      name: t.name,
      players: t.players.map(p => {
        // suggestedLevel/finalLevel só existem quando o jogador passou pelo balanceamento por
        // níveis (recommendDrawLevels) — campeões fixos e o algoritmo padrão não têm esses valores.
        // Omitidos (não `undefined`) porque o Firestore rejeita campos com valor undefined.
        const result: PeladaPlayerResult = {
          playerId: p.id,
          name: p.name,
          code: p.code,
          goals: 0,
          yellowCards: 0,
          redCards: 0,
          registeredLevel: p.level,
        };
        if (p.suggestedDrawLevel !== undefined) result.suggestedLevel = p.suggestedDrawLevel;
        if (p.drawLevel !== undefined) result.finalLevel = p.drawLevel;
        return result;
      }),
    }));

export const peladasDb = {
  // Salva o rascunho da pelada do dia (times sorteados) como 'pendente'.
  // Nunca sobrescreve uma pelada já 'concluída' — protege o resultado já lançado
  // de ser apagado por um sorteio de teste ou um "Refazer Sorteio" feito por engano.
  saveDraft: async (date: string, teams: Team[]): Promise<void> => {
    const ref = doc(firestore, PELADAS_COLLECTION, date);
    const existing = await getDoc(ref);
    if (existing.exists() && (existing.data() as Pelada).status === 'concluída') {
      return;
    }

    const peladaData: Omit<Pelada, 'id'> = {
      date,
      status: 'pendente',
      teams: teamsToPeladaTeams(teams),
      createdAt: existing.exists() ? (existing.data() as Pelada).createdAt : Date.now(),
      updatedAt: Date.now(),
    };
    await setDoc(ref, peladaData);
  },

  getAll: async (): Promise<Pelada[]> => {
    const snapshot = await getDocs(collection(firestore, PELADAS_COLLECTION));
    const peladas = snapshot.docs.map(d => ({ ...(d.data() as Omit<Pelada, 'id'>), id: d.id }));
    return peladas.sort((a, b) => b.date.localeCompare(a.date));
  },

  getById: async (date: string): Promise<Pelada | undefined> => {
    const snapshot = await getDoc(doc(firestore, PELADAS_COLLECTION, date));
    return snapshot.exists() ? { ...(snapshot.data() as Omit<Pelada, 'id'>), id: snapshot.id } : undefined;
  },

  // Exclui uma pelada. Se ela estava 'concluída' (já teve título/gols/cartões somados ao
  // cadastro), reverte essa contribuição antes de apagar — subtraindo via increment() negativo,
  // igual à lógica de saveResult, só que comparando contra zero em vez de um valor novo.
  remove: async (date: string): Promise<void> => {
    const ref = doc(firestore, PELADAS_COLLECTION, date);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) return;
    const pelada = snapshot.data() as Pelada;

    if (pelada.status === 'concluída') {
      await Promise.all(
        pelada.teams.flatMap(t => t.players).map(async p => {
          const isChampion = pelada.championTeamId === pelada.teams.find(t => t.players.some(pl => pl.playerId === p.playerId))?.id;
          try {
            await updateDoc(doc(firestore, PLAYERS_COLLECTION, p.playerId), {
              goals: increment(-p.goals),
              yellowCards: increment(-p.yellowCards),
              redCards: increment(-p.redCards),
              titles: increment(isChampion ? -1 : 0),
            });
          } catch (e) {
            console.error(`Não foi possível reverter estatísticas de ${p.name} (${p.playerId})`, e);
          }
        })
      );
    }

    await deleteDoc(ref);
  },

  // Salva o resultado da pelada (time campeão + estatísticas por jogador).
  // Calcula a DIFERENÇA entre o valor novo e o valor que já estava salvo nessa mesma pelada,
  // e aplica só a diferença via increment() no cadastro do jogador — assim, editar um
  // resultado já lançado corrige o total sem duplicar nem perder contagem.
  saveResult: async (
    date: string,
    championTeamId: number,
    results: Record<string, Pick<PeladaPlayerResult, 'goals' | 'yellowCards' | 'redCards'>>
  ): Promise<void> => {
    const ref = doc(firestore, PELADAS_COLLECTION, date);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      throw new Error(`Pelada ${date} não encontrada.`);
    }
    const existing = snapshot.data() as Pelada;
    const oldChampionTeamId = existing.status === 'concluída' ? existing.championTeamId : undefined;

    const oldStatsByPlayer = new Map<string, Pick<PeladaPlayerResult, 'goals' | 'yellowCards' | 'redCards'>>();
    existing.teams.forEach(t => t.players.forEach(p => oldStatsByPlayer.set(p.playerId, p)));

    const updatedTeams: PeladaTeam[] = existing.teams.map(t => ({
      ...t,
      players: t.players.map(p => ({
        ...p,
        ...(results[p.playerId] ?? { goals: p.goals, yellowCards: p.yellowCards, redCards: p.redCards }),
      })),
    }));

    await Promise.all(
      updatedTeams.flatMap(t => t.players).map(async p => {
        const old = oldStatsByPlayer.get(p.playerId) ?? { goals: 0, yellowCards: 0, redCards: 0 };
        const isNewChampion = championTeamId === updatedTeams.find(t => t.players.some(pl => pl.playerId === p.playerId))?.id;
        const wasOldChampion = oldChampionTeamId === updatedTeams.find(t => t.players.some(pl => pl.playerId === p.playerId))?.id;
        const titleDelta = (isNewChampion ? 1 : 0) - (wasOldChampion ? 1 : 0);

        const goalsDelta = p.goals - old.goals;
        const yellowDelta = p.yellowCards - old.yellowCards;
        const redDelta = p.redCards - old.redCards;

        if (goalsDelta === 0 && yellowDelta === 0 && redDelta === 0 && titleDelta === 0) return;

        try {
          await updateDoc(doc(firestore, PLAYERS_COLLECTION, p.playerId), {
            goals: increment(goalsDelta),
            yellowCards: increment(yellowDelta),
            redCards: increment(redDelta),
            titles: increment(titleDelta),
          });
        } catch (e) {
          // Jogador pode não existir mais no cadastro (ex: excluído depois da pelada) — não trava o salvamento dos demais.
          console.error(`Não foi possível atualizar estatísticas de ${p.name} (${p.playerId})`, e);
        }
      })
    );

    const peladaData: Omit<Pelada, 'id'> = {
      date,
      status: 'concluída',
      teams: updatedTeams,
      championTeamId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    await setDoc(ref, peladaData);
  },

  // Varre todas as peladas e calcula, por jogador, a média de (nível final - nível sugerido)
  // — só considerando peladas onde o jogador passou pelo balanceamento por níveis de verdade.
  // Calculado sob demanda a partir do histórico (não é um agregado mantido no cadastro) para
  // não correr risco de dessincronia entre criar/editar/excluir pelada.
  computeHistoricalBias: async (playerIds?: string[]): Promise<Record<string, HistoricalBias>> => {
    const peladas = await peladasDb.getAll();
    const deltasByPlayer = new Map<string, number[]>();

    peladas.forEach(pelada => {
      pelada.teams.forEach(team => {
        team.players.forEach(p => {
          if (p.suggestedLevel === undefined || p.finalLevel === undefined) return;
          if (playerIds && !playerIds.includes(p.playerId)) return;
          const delta = p.finalLevel - p.suggestedLevel;
          if (!deltasByPlayer.has(p.playerId)) deltasByPlayer.set(p.playerId, []);
          deltasByPlayer.get(p.playerId)!.push(delta);
        });
      });
    });

    const result: Record<string, HistoricalBias> = {};
    deltasByPlayer.forEach((deltas, playerId) => {
      const bias = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
      result[playerId] = { bias, sampleSize: deltas.length };
    });
    return result;
  },
};

export interface HistoricalBias {
  bias: number; // média bruta de (nível final - nível sugerido) nas peladas com dado disponível
  sampleSize: number; // quantas peladas embasam essa média
}

const MIN_SAMPLE_SIZE = 4;

// Ajuste pronto para somar ao nível cadastrado na recomendação de grupos do sorteio:
// amostra mínima de 4 peladas, sempre limitado a ±1 para o histórico nunca dominar o cadastro oficial.
export const getDrawAdjustment = (bias: HistoricalBias | undefined): number => {
  if (!bias || bias.sampleSize < MIN_SAMPLE_SIZE) return 0;
  return Math.max(-1, Math.min(1, bias.bias));
};

// Jogador com sinal forte o bastante pra valer uma revisão manual do nível cadastrado no Admin.
export const isReviewWorthy = (bias: HistoricalBias): boolean =>
  bias.sampleSize >= MIN_SAMPLE_SIZE && Math.abs(bias.bias) >= 0.75;
