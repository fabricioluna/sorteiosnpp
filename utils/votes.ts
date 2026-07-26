import { collection, doc, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import { firestore } from './firebase';
import { Position, Vote } from '../types';

const VOTES_COLLECTION = 'votes';

// Uma chave por votante+jogador, para que um novo voto substitua o anterior
// em vez de acumular votos duplicados da mesma pessoa.
const voteDocId = (playerId: string, voterName: string): string => {
  const voterKey = voterName.trim().toLowerCase().replace(/\s+/g, '-');
  return `${playerId}_${voterKey}`;
};

export const votesDb = {
  submitVote: async (playerId: string, voterName: string, level: number, position: Position): Promise<void> => {
    const id = voteDocId(playerId, voterName);
    await setDoc(doc(firestore, VOTES_COLLECTION, id), {
      playerId,
      voterName: voterName.trim(),
      level,
      position,
      updatedAt: Date.now(),
    });
  },

  getAllVotes: async (): Promise<Vote[]> => {
    const snapshot = await getDocs(collection(firestore, VOTES_COLLECTION));
    return snapshot.docs.map(d => ({ ...(d.data() as Omit<Vote, 'id'>), id: d.id }));
  },

  // Zera todos os votos (para começar uma nova rodada de levantamento).
  clearAllVotes: async (): Promise<void> => {
    const snapshot = await getDocs(collection(firestore, VOTES_COLLECTION));
    const batch = writeBatch(firestore);
    snapshot.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  },
};

export interface VoteSummary {
  voteCount: number;
  avgLevel: number;
  topPosition: Position | null;
}

export const summarizeVotes = (votes: Vote[]): Record<string, VoteSummary> => {
  const byPlayer: Record<string, Vote[]> = {};
  votes.forEach(v => {
    (byPlayer[v.playerId] ||= []).push(v);
  });

  const summary: Record<string, VoteSummary> = {};
  Object.entries(byPlayer).forEach(([playerId, playerVotes]) => {
    const avgLevel = playerVotes.reduce((sum, v) => sum + v.level, 0) / playerVotes.length;

    const positionCounts = new Map<Position, number>();
    playerVotes.forEach(v => positionCounts.set(v.position, (positionCounts.get(v.position) || 0) + 1));
    const topPosition = [...positionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    summary[playerId] = {
      voteCount: playerVotes.length,
      avgLevel: Math.round(avgLevel * 10) / 10,
      topPosition,
    };
  });

  return summary;
};
