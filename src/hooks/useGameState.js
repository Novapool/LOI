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

  useEffect(() => {
    if (!supabase || !roomCode) {
      setError('Supabase not configured or room code missing');
      return;
    }

    // Create a channel for this specific room
    const roomChannel = supabase.channel(`game:${roomCode}`, {
      config: {
        broadcast: { self: true } // Receive our own broadcasts
      }
    });

    // Subscribe to game state broadcasts
    roomChannel
      .on('broadcast', { event: 'game-state' }, ({ payload }) => {
        setGameState(payload);
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
