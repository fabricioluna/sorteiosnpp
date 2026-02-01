import { Player, Team } from '../types';

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
 * Balances teams respecting fixed players (Champions).
 */
export const balanceTeams = (players: Player[]): Team[] => {
  const teams: Team[] = [
    { id: 1, name: 'Time 1', players: [], totalLevel: 0 },
    { id: 2, name: 'Time 2', players: [], totalLevel: 0 },
    { id: 3, name: 'Time 3', players: [], totalLevel: 0 },
    { id: 4, name: 'Time 4', players: [], totalLevel: 0 },
  ];

  // 1. Separate fixed players (Champions) from the pool
  const fixedPlayers = players.filter(p => p.isFixedInTeam1);
  const poolPlayers = players.filter(p => !p.isFixedInTeam1);

  // 2. Assign fixed players immediately to Team 1
  if (fixedPlayers.length > 0) {
    teams[0].players = [...fixedPlayers];
    teams[0].totalLevel = fixedPlayers.reduce((sum, p) => sum + p.level, 0);
    teams[0].name = "Time 1 (Atual Campeão)";
  }

  // 3. Prepare to distribute the pool players
  const shuffledPool = shuffle(poolPlayers);
  const sortedPool = shuffledPool.sort((a, b) => b.level - a.level);

  // Define target sizes: 5 players per team
  const targetSize = 5;

  // 4. Distribute pool players using Greedy Balancing
  // We only assign to teams that aren't full yet.
  // If Team 1 has 5 champions, it will be skipped automatically.
  
  const playersToAssign = [...sortedPool];
  
  while (playersToAssign.length > 0) {
    const player = playersToAssign.shift()!;
    
    // Find teams that still have slots available
    const availableTeamIndices = teams
      .map((t, idx) => t.players.length < targetSize ? idx : -1)
      .filter(idx => idx !== -1);

    if (availableTeamIndices.length === 0) break; // Should not happen if math is right

    // Among available teams, pick the one with the lowest total level
    let bestTeamIdx = availableTeamIndices[0];
    let minLevel = teams[bestTeamIdx].totalLevel;

    for (const idx of availableTeamIndices) {
      if (teams[idx].totalLevel < minLevel) {
        minLevel = teams[idx].totalLevel;
        bestTeamIdx = idx;
      } else if (teams[idx].totalLevel === minLevel) {
        // Tie-breaker: fewest players
        if (teams[idx].players.length < teams[bestTeamIdx].players.length) {
          bestTeamIdx = idx;
        }
      }
    }

    teams[bestTeamIdx].players.push(player);
    teams[bestTeamIdx].totalLevel += player.level;
  }

  // 5. Positional refinement (Only for non-fixed teams usually, but let's run generally)
  // We avoid swapping players from Team 1 if they are fixed champions
  refinePositions(teams);

  return teams;
};

const refinePositions = (teams: Team[]) => {
  const fullTeams = teams.filter(t => t.players.length === 5);
  
  for (let i = 0; i < fullTeams.length; i++) {
    // Skip refinement for the Champion Team (assuming they shouldn't be touched)
    // We detect this if any player in the team is fixed
    if (fullTeams[i].players.some(p => p.isFixedInTeam1)) continue;

    const defenders = fullTeams[i].players.filter(p => p.position === 'Zagueiro');
    
    if (defenders.length === 0) {
      // Look for a donor team
      for (let j = 0; j < fullTeams.length; j++) {
        if (i === j) continue;
        // Don't take from Champion Team
        if (fullTeams[j].players.some(p => p.isFixedInTeam1)) continue;

        const otherDefenders = fullTeams[j].players.filter(p => p.position === 'Zagueiro');
        
        if (otherDefenders.length >= 2) {
          for (const d of otherDefenders) {
            // Find swap partner of same level
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
