/**
 * useGameState hook using Postgres Realtime + Database Triggers
 *
 * This uses Postgres Realtime (Change Data Capture) for real-time subscriptions.
 * Game state changes are server-authoritative via PostgreSQL triggers and RPC functions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { GAME_CONFIG } from '../config';

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
    isCustomQuestion: false,
    rerollsUsed: {}
  });

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  // Ref for single consolidated channel
  const channelRef = useRef(null);
  
  // Ref for loading timeout
  const loadingTimeoutRef = useRef(null);
  
  // Ref to track if initial connection succeeded
  const hasConnectedRef = useRef(false);
  
  // Ref to track if timeout has fired
  const timeoutFiredRef = useRef(false);

  /**
   * Helper to mark connection as successful and clear loading timeout
   */
  const markConnectionSuccessful = useCallback(() => {
    hasConnectedRef.current = true;
    
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  }, []);

  /**
   * Fetch current game state from database
   * Optimized to batch queries using Promise.all for parallel execution
   */
  const fetchGameState = useCallback(async () => {
    if (!supabase || !roomCode) return;

    try {
      // Batch all queries in parallel for better performance
      const [roomResult, playersResult] = await Promise.all([
        supabase
          .from('game_rooms')
          .select('*')
          .eq('room_code', roomCode)
          .single(),
        supabase
          .from('game_players')
          .select('*')
          .eq('room_code', roomCode)
          .order('joined_at', { ascending: true })
      ]);

      const { data: room, error: roomError } = roomResult;
      const { data: players, error: playersError } = playersResult;

      if (roomError) {
        // Only set error if we're past the initial loading phase
        if (hasConnectedRef.current) {
          if (roomError.code === 'PGRST116') {
            setError('Room not found');
          } else {
            if (import.meta.env.DEV) {
              console.error('Error fetching room:', roomError);
            }
            setError('Failed to fetch room data');
          }
        } else {
          // During initial loading, just log the error but don't show it
          if (import.meta.env.DEV) {
            console.log('Waiting for room data...', roomError);
          }
        }
        return;
      }

      if (playersError && import.meta.env.DEV) {
        console.error('Error fetching players:', playersError);
      }

      // Fetch game state conditionally (if game is playing)
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
        isCustomQuestion: gameStateData?.is_custom_question ?? false,
        rerollsUsed: gameStateData?.rerolls_used ?? {}
      });

      // Mark connection as successful and clear loading timeout
      markConnectionSuccessful();
      
      setIsConnected(true);
      setError(null);

    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error fetching game state:', err);
      }
      // Only set error if we're past the initial loading phase
      if (hasConnectedRef.current) {
        setError('Failed to load game state');
      }
    }
  }, [roomCode, markConnectionSuccessful]);

  /**
   * Subscribe to Postgres Realtime changes using a single consolidated channel
   */
  useEffect(() => {
    if (!supabase) {
      setError('Supabase not configured');
      return;
    }
    
    if (!roomCode) {
      // No room code yet - this is the initial state, not an error
      return;
    }

    // Clear any existing timeout before setting a new one
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }
    
    // Reset connection tracking
    hasConnectedRef.current = false;
    timeoutFiredRef.current = false;
    
    // Set up loading timeout
    loadingTimeoutRef.current = setTimeout(() => {
      // Only show error if we haven't connected after timeout
      if (!hasConnectedRef.current) {
        timeoutFiredRef.current = true;
        setError('Connection timeout - unable to reach room. Please check your connection and try again.');
        setIsConnected(false);
      }
    }, GAME_CONFIG.CONNECTION_TIMEOUT);

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
        (payload) => {
          if (import.meta.env.DEV) {
            console.log('Players updated:', payload);
          }
          
          // Optimize DELETE events - remove player directly from state instead of refetching
          if (payload.eventType === 'DELETE' && payload.old) {
            const deletedPlayerId = payload.old.player_id;
            setGameState(prev => ({
              ...prev,
              players: prev.players.filter(p => p.id !== deletedPlayerId)
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
            isCustomQuestion: newData.is_custom_question,
            rerollsUsed: newData.rerolls_used ?? {}
          }));
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Mark connection as successful and clear loading timeout
          markConnectionSuccessful();
          
          setIsConnected(true);
          setError(null);
          if (import.meta.env.DEV) {
            console.log('Connected to Realtime');
          }
        } else if (status === 'CHANNEL_ERROR') {
          // Only show error if we're past initial loading or timeout occurred
          if (hasConnectedRef.current || timeoutFiredRef.current) {
            setError('Failed to connect to real-time updates');
            setIsConnected(false);
          }
        }
      });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      // Clear loading timeout if still active
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      
      channel.unsubscribe();
      setIsConnected(false);
    };
  }, [roomCode, fetchGameState, markConnectionSuccessful]);

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

    // Use configured heartbeat interval
    const interval = setInterval(updateHeartbeat, GAME_CONFIG.HEARTBEAT_INTERVAL);

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
