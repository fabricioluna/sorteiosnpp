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
      players: t.players.map(p => ({
        playerId: p.id,
        name: p.name,
        code: p.code,
        goals: 0,
        yellowCards: 0,
        redCards: 0,
      })),
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

  // Exclui uma pelada específica. Não exposto em nenhum botão do app —
  // o histórico de peladas nunca é apagável pela interface, só por aqui em manutenção pontual.
  delete: async (date: string): Promise<void> => {
    await deleteDoc(doc(firestore, PELADAS_COLLECTION, date));
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
};
