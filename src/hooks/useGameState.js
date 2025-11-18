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
    playerOrder: [],
    currentAskerIndex: 0,
    currentAnswererIndex: 1,
    currentQuestion: null,
    questionCount: 0,
    isCustomQuestion: false
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
          if (import.meta.env.DEV) {
            console.error('Error fetching room:', roomError);
          }
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

      if (playersError && import.meta.env.DEV) {
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
        playerOrder: gameStateData?.player_order ?? [],
        currentAskerIndex: gameStateData?.current_asker_index ?? 0,
        currentAnswererIndex: gameStateData?.current_answerer_index ?? 1,
        currentQuestion: gameStateData?.current_question ?? null,
        questionCount: gameStateData?.question_count ?? 0,
        isCustomQuestion: gameStateData?.is_custom_question ?? false
      });

      setIsConnected(true);
      setError(null);

    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error fetching game state:', err);
      }
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
          if (import.meta.env.DEV) {
            console.log('Room updated:', payload);
          }

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
          if (import.meta.env.DEV) {
            console.log('Players updated:', payload);
          }
          
          // For DELETE events, refetch to get current player list
          if (payload.eventType === 'DELETE') {
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
            return;
          }

          // For INSERT/UPDATE, optimize by using payload data when available
          if (payload.new) {
            const updatedPlayer = {
              id: payload.new.player_id,
              name: payload.new.player_name,
              isHost: payload.new.is_host
            };

            setGameState(prev => {
              // Check if player already exists
              const existingIndex = prev.players.findIndex(p => p.id === updatedPlayer.id);
              
              if (existingIndex >= 0) {
                // Update existing player
                const newPlayers = [...prev.players];
                newPlayers[existingIndex] = updatedPlayer;
                return { ...prev, players: newPlayers };
              } else {
                // Add new player
                return { ...prev, players: [...prev.players, updatedPlayer] };
              }
            });
          }
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
          if (import.meta.env.DEV) {
            console.log('Game state updated:', payload);
          }

          const newData = payload.new;
          setGameState(prev => ({
            ...prev,
            currentLevel: newData.current_level,
            playerOrder: newData.player_order,
            currentAskerIndex: newData.current_asker_index,
            currentAnswererIndex: newData.current_answerer_index,
            currentQuestion: newData.current_question,
            questionCount: newData.question_count,
            isCustomQuestion: newData.is_custom_question
          }));
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          if (import.meta.env.DEV) {
            console.log('Connected to Realtime');
          }
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
   * Optimized to reduce database load
   */
  useEffect(() => {
    if (!playerId || !roomCode || !isConnected) return;

    const updateHeartbeat = async () => {
      try {
        await supabase
          .from('game_players')
          .update({ last_heartbeat: new Date().toISOString() })
          .eq('room_code', roomCode)
          .eq('player_id', playerId);
      } catch (err) {
        console.error('Heartbeat failed:', err);
      }
    };

    // Send initial heartbeat (catch errors silently in production)
    updateHeartbeat();

    // Use 30 second interval for better performance (reduced from 10s)
    const heartbeatInterval = 30000;
    const interval = setInterval(updateHeartbeat, heartbeatInterval);

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
