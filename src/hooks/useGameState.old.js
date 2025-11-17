import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

/**
 * Custom hook for managing game state with Supabase real-time sync
 *
 * @param {string} roomCode - The room code for the game
 * @param {Object} initialState - Initial game state
 * @returns {Object} { gameState, updateGameState, isConnected, error }
 */
export function useGameState(roomCode, initialState) {
  const [gameState, setGameState] = useState(initialState);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [channel, setChannel] = useState(null);
  const [myPresenceId, setMyPresenceId] = useState(null);

  useEffect(() => {
    if (!supabase || !roomCode) {
      setError('Supabase not configured or room code missing');
      return;
    }

    // Create a channel for this specific room
    const roomChannel = supabase.channel(`game:${roomCode}`, {
      config: {
        broadcast: { self: false } // Don't receive our own broadcasts
      }
    });

    // Subscribe to game state broadcasts
    roomChannel
      .on('broadcast', { event: 'game-state' }, ({ payload }) => {
        setGameState((currentState) => {
          // Merge player lists intelligently to prevent overwrites
          if (payload.players && currentState.players) {
            // Create a map of existing players by ID
            const playerMap = new Map();

            // Add all current players first
            currentState.players.forEach(player => {
              playerMap.set(player.id, player);
            });

            // Add/update with incoming players
            payload.players.forEach(player => {
              playerMap.set(player.id, player);
            });

            // Convert back to array maintaining order
            const mergedPlayers = Array.from(playerMap.values());

            // Merge state carefully - only update fields that changed
            return {
              ...currentState,
              // Always accept these critical fields from payload
              status: payload.status !== undefined ? payload.status : currentState.status,
              currentLevel: payload.currentLevel !== undefined ? payload.currentLevel : currentState.currentLevel,
              currentPlayerIndex: payload.currentPlayerIndex !== undefined ? payload.currentPlayerIndex : currentState.currentPlayerIndex,
              currentQuestion: payload.currentQuestion !== undefined ? payload.currentQuestion : currentState.currentQuestion,
              questionCount: payload.questionCount !== undefined ? payload.questionCount : currentState.questionCount,
              // Use merged players list
              players: mergedPlayers,
              // NEVER overwrite hostId once set (only creator sets it)
              hostId: currentState.hostId || payload.hostId,
              // Preserve room code
              roomCode: currentState.roomCode || payload.roomCode
            };
          }

          // If no players in current state, accept payload as-is
          return {
            ...currentState,
            ...payload,
            // But still preserve roomCode
            roomCode: currentState.roomCode || payload.roomCode
          };
        });
      })
      .on('presence', { event: 'sync' }, () => {
        // Get all present users
        const state = roomChannel.presenceState();
        const presentPlayerIds = Object.keys(state).flatMap(key =>
          state[key].map(presence => presence.playerId)
        ).filter(Boolean);

        setGameState((currentState) => {
          // Check if host is still present
          const hostPresent = presentPlayerIds.includes(currentState.hostId);

          if (!hostPresent && currentState.players.length > 0) {
            // Host left - transfer to first remaining player
            const remainingPlayers = currentState.players.filter(p =>
              presentPlayerIds.includes(p.id)
            );

            if (remainingPlayers.length > 0) {
              const newHostId = remainingPlayers[0].id;

              // Broadcast the new host assignment
              if (channel && isConnected) {
                setTimeout(() => {
                  channel.send({
                    type: 'broadcast',
                    event: 'game-state',
                    payload: {
                      ...currentState,
                      hostId: newHostId,
                      players: remainingPlayers
                    }
                  });
                }, 100);
              }

              return {
                ...currentState,
                hostId: newHostId,
                players: remainingPlayers
              };
            }
          }

          // Remove disconnected players
          if (currentState.players.length > presentPlayerIds.length) {
            const updatedPlayers = currentState.players.filter(p =>
              presentPlayerIds.includes(p.id)
            );

            return {
              ...currentState,
              players: updatedPlayers
            };
          }

          return currentState;
        });
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('Player joined presence:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('Player left presence:', key, leftPresences);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          setError(null);
        } else if (status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          setError('Connection error');
        } else if (status === 'TIMED_OUT') {
          setIsConnected(false);
          setError('Connection timed out');
        }
      });

    setChannel(roomChannel);

    // Cleanup on unmount
    return () => {
      roomChannel.unsubscribe();
      setIsConnected(false);
    };
  }, [roomCode]);

  // Track presence when connected
  useEffect(() => {
    if (channel && isConnected && gameState.players.length > 0) {
      // Find current player in the game state
      const currentPlayer = gameState.players.find(p =>
        p.id && p.id.startsWith('player-')
      );

      if (currentPlayer) {
        // Track presence with player ID
        channel.track({
          playerId: currentPlayer.id,
          online_at: new Date().toISOString()
        });
        setMyPresenceId(currentPlayer.id);
      }
    }
  }, [channel, isConnected, gameState.players]);

  /**
   * Update game state and broadcast to all connected clients
   *
   * @param {Object|Function} newState - New state object or updater function
   */
  const updateGameState = (newState) => {
    const updatedState = typeof newState === 'function'
      ? newState(gameState)
      : { ...gameState, ...newState };

    // Update local state immediately (optimistic update)
    setGameState(updatedState);

    // Broadcast to all connected clients
    if (channel && isConnected) {
      channel.send({
        type: 'broadcast',
        event: 'game-state',
        payload: updatedState
      });
    }
  };

  return {
    gameState,
    updateGameState,
    isConnected,
    error
  };
}

export { supabase };
