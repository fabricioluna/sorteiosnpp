
import { Player, Team, Position } from '../types';

/**
 * Standard Fisher-Yates shuffle to introduce randomness
 */
const shuffle = <T>(array: T[]): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/**
 * Balances teams respecting the "fill first teams" rule.
 * 1. Calculate how many players each team should have (5, 5, 5, remaining).
 * 2. Distribute players to keep strength balanced across teams that have slots.
 */
export const balanceTeams = (players: Player[]): Team[] => {
  const count = players.length;
  const shuffledPlayers = shuffle(players);
  const sortedPlayers = shuffledPlayers.sort((a, b) => b.level - a.level);

  // Define target sizes: [5, 5, 5, 5] if 20, [5, 5, 2, 0] if 12, etc.
  const targetSizes = [0, 0, 0, 0];
  let remaining = count;
  for (let i = 0; i < 4; i++) {
    const size = Math.min(5, remaining);
    targetSizes[i] = size;
    remaining -= size;
  }

  const teams: Team[] = [
    { id: 1, name: 'Time 1', players: [], totalLevel: 0 },
    { id: 2, name: 'Time 2', players: [], totalLevel: 0 },
    { id: 3, name: 'Time 3', players: [], totalLevel: 0 },
    { id: 4, name: 'Time 4', players: [], totalLevel: 0 },
  ];

  // Distribute players using a modified snake draft that respects target sizes
  let forward = true;
  let teamIdx = 0;

  // For balancing, we iterate through the sorted players
  // and assign them to teams that still have space
  const playersToAssign = [...sortedPlayers];
  
  // We use a simple greedy balancing approach here instead of strict snake
  // to better handle varying team sizes while keeping force balanced.
  while (playersToAssign.length > 0) {
    const player = playersToAssign.shift()!;
    
    // Find teams that still have slots available
    const availableTeamIndices = targetSizes
      .map((size, idx) => teams[idx].players.length < size ? idx : -1)
      .filter(idx => idx !== -1);

    if (availableTeamIndices.length === 0) break;

    // Among available teams, pick the one with the lowest total level to balance
    // If levels are equal, pick the one with the fewest players
    let bestTeamIdx = availableTeamIndices[0];
    let minLevel = teams[bestTeamIdx].totalLevel;

    for (const idx of availableTeamIndices) {
      if (teams[idx].totalLevel < minLevel) {
        minLevel = teams[idx].totalLevel;
        bestTeamIdx = idx;
      } else if (teams[idx].totalLevel === minLevel) {
        if (teams[idx].players.length < teams[bestTeamIdx].players.length) {
          bestTeamIdx = idx;
        }
      }
    }

    teams[bestTeamIdx].players.push(player);
    teams[bestTeamIdx].totalLevel += player.level;
  }

  // Positional refinement for full teams
  refinePositions(teams);

  return teams;
};

const refinePositions = (teams: Team[]) => {
  // Only refine for teams that are full (5 players)
  const fullTeams = teams.filter(t => t.players.length === 5);
  
  for (let i = 0; i < fullTeams.length; i++) {
    const defenders = fullTeams[i].players.filter(p => p.position === 'Zagueiro');
    if (defenders.length === 0) {
      for (let j = 0; j < fullTeams.length; j++) {
        if (i === j) continue;
        const otherDefenders = fullTeams[j].players.filter(p => p.position === 'Zagueiro');
        if (otherDefenders.length >= 2) {
          for (const d of otherDefenders) {
            // Find a swap partner of same level
            const match = fullTeams[i].players.find(p => p.level === d.level && p.position !== 'Zagueiro');
            if (match) {
              const p1Index = fullTeams[i].players.findIndex(p => p.id === match.id);
              const p2Index = fullTeams[j].players.findIndex(p => p.id === d.id);
              
              fullTeams[i].players[p1Index] = d;
              fullTeams[j].players[p2Index] = match;
              return; 
            }
          }
        }
      }
    }
  }
};
