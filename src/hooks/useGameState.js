/**
 * NEW VERSION: useGameState hook using Postgres Realtime + Edge Functions
 *
 * This replaces the old Broadcast channel approach with database-backed real-time subscriptions.
 * Game state changes are now server-authoritative via Edge Functions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

/**
 * Custom hook for managing game state with Supabase Postgres Realtime
 *
 * @param {string} roomCode - The room code for the game
 * @param {string} playerId - The current player's ID
 * @returns {Object} { gameState, isConnected, error, callEdgeFunction }
 */
export function useGameState(roomCode, playerId) {
  const [gameState, setGameState] = useState({
    roomCode: roomCode,
    players: [],
    status: 'lobby',
    hostId: null,
    settings: {
      startLevel: 5,
      questionsPerLevel: 3
    },
    currentLevel: 5,
    currentPlayerIndex: 0,
    currentQuestion: null,
    questionCount: 0
  });

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  // Refs for channels
  const roomsChannelRef = useRef(null);
  const playersChannelRef = useRef(null);
  const stateChannelRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);

  /**
   * Helper function to call Edge Functions
   */
  const callEdgeFunction = useCallback(async (functionName, payload) => {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/${functionName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`
          },
          body: JSON.stringify(payload)
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to call ${functionName}`);
      }

      return data;
    } catch (err) {
      console.error(`Error calling ${functionName}:`, err);
      throw err;
    }
  }, []);

  /**
   * Fetch current game state from database
   */
  const fetchGameState = useCallback(async () => {
    if (!supabase || !roomCode) return;

    try {
      // Fetch room info
      const { data: room, error: roomError } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('room_code', roomCode.toUpperCase())
        .single();

      if (roomError) {
        if (roomError.code === 'PGRST116') {
          setError('Room not found');
        } else {
          console.error('Error fetching room:', roomError);
          setError('Failed to fetch room data');
        }
        return;
      }

      // Fetch players
      const { data: players, error: playersError } = await supabase
        .from('game_players')
        .select('*')
        .eq('room_code', roomCode.toUpperCase())
        .order('joined_at', { ascending: true });

      if (playersError) {
        console.error('Error fetching players:', playersError);
      }

      // Fetch game state (if game is playing)
      let gameStateData = null;
      if (room.status === 'playing' || room.status === 'finished') {
        const { data, error: stateError } = await supabase
          .from('game_state')
          .select('*')
          .eq('room_code', roomCode.toUpperCase())
          .single();

        if (!stateError && data) {
          gameStateData = data;
        }
      }

      // Update local game state
      setGameState({
        roomCode: room.room_code,
        hostId: room.host_id,
        status: room.status,
        settings: room.settings || { startLevel: 5, questionsPerLevel: 3 },
        players: (players || []).map(p => ({
          id: p.player_id,
          name: p.player_name,
          isHost: p.is_host
        })),
        currentLevel: gameStateData?.current_level ?? 5,
        currentPlayerIndex: gameStateData?.current_player_index ?? 0,
        currentQuestion: gameStateData?.current_question ?? null,
        questionCount: gameStateData?.question_count ?? 0
      });

      setIsConnected(true);
      setError(null);

    } catch (err) {
      console.error('Error fetching game state:', err);
      setError('Failed to load game state');
    }
  }, [roomCode]);

  /**
   * Subscribe to Postgres Realtime changes
   */
  useEffect(() => {
    if (!supabase || !roomCode) {
      setError('Supabase not configured or room code missing');
      return;
    }

    // Fetch initial state
    fetchGameState();

    // Subscribe to game_rooms changes
    const roomsChannel = supabase
      .channel(`game_rooms:${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_rooms',
          filter: `room_code=eq.${roomCode.toUpperCase()}`
        },
        (payload) => {
          console.log('Room updated:', payload);

          if (payload.eventType === 'DELETE') {
            setError('Room was deleted');
            setIsConnected(false);
            return;
          }

          const newData = payload.new;
          setGameState(prev => ({
            ...prev,
            hostId: newData.host_id,
            status: newData.status,
            settings: newData.settings
          }));
        }
      )
      .subscribe();

    // Subscribe to game_players changes
    const playersChannel = supabase
      .channel(`game_players:${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_players',
          filter: `room_code=eq.${roomCode.toUpperCase()}`
        },
        (payload) => {
          console.log('Players updated:', payload);
          // Refetch all players to keep list in sync
          fetchGameState();
        }
      )
      .subscribe();

    // Subscribe to game_state changes
    const stateChannel = supabase
      .channel(`game_state:${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_state',
          filter: `room_code=eq.${roomCode.toUpperCase()}`
        },
        (payload) => {
          console.log('Game state updated:', payload);

          const newData = payload.new;
          setGameState(prev => ({
            ...prev,
            currentLevel: newData.current_level,
            currentPlayerIndex: newData.current_player_index,
            currentQuestion: newData.current_question,
            questionCount: newData.question_count
          }));
        }
      )
      .subscribe();

    roomsChannelRef.current = roomsChannel;
    playersChannelRef.current = playersChannel;
    stateChannelRef.current = stateChannel;

    // Cleanup on unmount
    return () => {
      roomsChannel.unsubscribe();
      playersChannel.unsubscribe();
      stateChannel.unsubscribe();
      setIsConnected(false);
    };
  }, [roomCode, fetchGameState]);

  /**
   * Send heartbeat to maintain presence
   */
  useEffect(() => {
    if (!playerId || !roomCode || !isConnected) return;

    // Send initial heartbeat
    callEdgeFunction('player-heartbeat', { roomCode, playerId }).catch(err => {
      console.error('Initial heartbeat failed:', err);
    });

    // Send heartbeat every 10 seconds
    const interval = setInterval(() => {
      callEdgeFunction('player-heartbeat', { roomCode, playerId }).catch(err => {
        console.error('Heartbeat failed:', err);
      });
    }, 10000);

    heartbeatIntervalRef.current = interval;

    return () => {
      clearInterval(interval);
    };
  }, [playerId, roomCode, isConnected, callEdgeFunction]);

  return {
    gameState,
    isConnected,
    error,
    callEdgeFunction,
    refetch: fetchGameState
  };
}

export { supabase };
