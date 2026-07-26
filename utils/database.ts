import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
} from 'firebase/firestore';
import { firestore } from './firebase';
import { Player } from '../types';

const PLAYERS_COLLECTION = 'players';

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
  getAllPlayers: async (): Promise<Player[]> => {
    try {
      const snapshot = await getDocs(collection(firestore, PLAYERS_COLLECTION));
      return snapshot.docs.map(d => ({ ...(d.data() as Omit<Player, 'id'>), id: d.id }));
    } catch (e) {
      console.error('Erro ao ler banco de dados', e);
      return [];
    }
  },

  addPlayer: async (player: Omit<Player, 'id' | 'code' | 'redCards' | 'goals'>): Promise<Player> => {
    const players = await db.getAllPlayers();

    const newPlayerData = {
      code: generateCode(players),
      name: player.name,
      position: player.position,
      level: player.level,
      redCards: 0,
      goals: 0,
      yellowCards: 0,
      titles: 0,
    };

    const docRef = await addDoc(collection(firestore, PLAYERS_COLLECTION), newPlayerData);
    return { ...newPlayerData, id: docRef.id };
  },

  // Cria um jogador com código explícito (em vez de gerado automaticamente).
  // Usado pela importação em lote. Não valida duplicidade — quem chama deve checar antes.
  addPlayerWithCode: async (player: Omit<Player, 'id' | 'redCards' | 'goals'>): Promise<Player> => {
    const newPlayerData = {
      code: player.code,
      name: player.name,
      position: player.position,
      level: player.level,
      redCards: 0,
      goals: 0,
      yellowCards: 0,
      titles: 0,
    };

    const docRef = await addDoc(collection(firestore, PLAYERS_COLLECTION), newPlayerData);
    return { ...newPlayerData, id: docRef.id };
  },

  updatePlayer: async (id: string, updates: Partial<Omit<Player, 'id' | 'code'>>): Promise<void> => {
    await updateDoc(doc(firestore, PLAYERS_COLLECTION, id), updates);
  },

  deletePlayer: async (id: string): Promise<void> => {
    await deleteDoc(doc(firestore, PLAYERS_COLLECTION, id));
  },

  findByName: async (name: string): Promise<Player | undefined> => {
    const players = await db.getAllPlayers();
    return players.find(p => p.name.toLowerCase() === name.toLowerCase());
  },

  findByCode: async (code: string): Promise<Player | undefined> => {
    const players = await db.getAllPlayers();
    return players.find(p => p.code === code);
  },

  clearAll: async (): Promise<void> => {
    const snapshot = await getDocs(collection(firestore, PLAYERS_COLLECTION));
    const batch = writeBatch(firestore);
    snapshot.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  },

  // Zera só o(s) campo(s) agregados indicados em todo jogador — nunca mexe no histórico de peladas.
  resetPlayerStats: async (fields: Partial<Pick<Player, 'titles' | 'goals' | 'yellowCards' | 'redCards'>>): Promise<void> => {
    const snapshot = await getDocs(collection(firestore, PLAYERS_COLLECTION));
    const batch = writeBatch(firestore);
    snapshot.docs.forEach(d => batch.update(d.ref, fields));
    await batch.commit();
  },
};
