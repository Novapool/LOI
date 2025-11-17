/**
 * useGameState hook using Postgres Realtime + Database Triggers
 *
 * This uses Postgres Realtime (Change Data Capture) for real-time subscriptions.
 * Game state changes are server-authoritative via PostgreSQL triggers and RPC functions.
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
 * @param {string} roomCode - The room code for the game (must be uppercase)
 * @param {string} playerId - The current player's ID
 * @returns {Object} { gameState, isConnected, error }
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

  // Ref for single consolidated channel
  const channelRef = useRef(null);

  /**
   * Fetch current game state from database
   */
  const fetchGameState = useCallback(async () => {
    if (!supabase || !roomCode) return;

    try {
      // Fetch room info (roomCode is already uppercase)
      const { data: room, error: roomError } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('room_code', roomCode)
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
        .eq('room_code', roomCode)
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
          .eq('room_code', roomCode)
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
   * Subscribe to Postgres Realtime changes using a single consolidated channel
   */
  useEffect(() => {
    if (!supabase || !roomCode) {
      setError('Supabase not configured or room code missing');
      return;
    }

    // Fetch initial state
    fetchGameState();

    // Single channel for all table subscriptions
    const channel = supabase
      .channel(`room:${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_rooms',
          filter: `room_code=eq.${roomCode}`
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_players',
          filter: `room_code=eq.${roomCode}`
        },
        async (payload) => {
          console.log('Players updated:', payload);
          // Selectively refetch only players, not entire game state
          const { data: players } = await supabase
            .from('game_players')
            .select('*')
            .eq('room_code', roomCode)
            .order('joined_at', { ascending: true });

          setGameState(prev => ({
            ...prev,
            players: (players || []).map(p => ({
              id: p.player_id,
              name: p.player_name,
              isHost: p.is_host
            }))
          }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_state',
          filter: `room_code=eq.${roomCode}`
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          console.log('Connected to Realtime');
        } else if (status === 'CHANNEL_ERROR') {
          setError('Failed to connect to real-time updates');
          setIsConnected(false);
        }
      });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      channel.unsubscribe();
      setIsConnected(false);
    };
  }, [roomCode]);

  /**
   * Send heartbeat to maintain presence
   */
  useEffect(() => {
    if (!playerId || !roomCode || !isConnected) return;

    const updateHeartbeat = async () => {
      await supabase
        .from('game_players')
        .update({ last_heartbeat: new Date().toISOString() })
        .eq('room_code', roomCode)
        .eq('player_id', playerId);
    };

    // Send initial heartbeat
    updateHeartbeat().catch(err => {
      console.error('Initial heartbeat failed:', err);
    });

    // Send heartbeat every 10 seconds
    const interval = setInterval(() => {
      updateHeartbeat().catch(err => {
        console.error('Heartbeat failed:', err);
      });
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, [playerId, roomCode, isConnected]);

  return {
    gameState,
    isConnected,
    error
  };
}

export { supabase };
