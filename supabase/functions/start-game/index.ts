// Edge Function: start-game
// Starts the game (host only) and initializes game state

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface StartGameRequest {
  roomCode: string
  playerId: string // Must be the host
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const { roomCode, playerId }: StartGameRequest = await req.json()

    // Validation
    if (!roomCode || !playerId) {
      return new Response(
        JSON.stringify({ error: 'roomCode and playerId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check if room exists
    const { data: room, error: roomError } = await supabaseAdmin
      .from('game_rooms')
      .select('*')
      .eq('room_code', roomCode.toUpperCase())
      .single()

    if (roomError || !room) {
      return new Response(
        JSON.stringify({ error: 'Room not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify requester is the host
    if (room.host_id !== playerId) {
      return new Response(
        JSON.stringify({ error: 'Only the host can start the game' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if game is already started
    if (room.status !== 'lobby') {
      return new Response(
        JSON.stringify({ error: 'Game has already started or finished' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get all players in the room
    const { data: players, error: playersError } = await supabaseAdmin
      .from('game_players')
      .select('*')
      .eq('room_code', roomCode.toUpperCase())
      .order('joined_at', { ascending: true })

    if (playersError || !players || players.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No players found in room' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check minimum players (from your GAME_CONFIG.MIN_PLAYERS = 3)
    const minPlayers = 3
    if (players.length < minPlayers) {
      return new Response(
        JSON.stringify({ error: `Need at least ${minPlayers} players to start` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Select random first player
    const randomPlayerIndex = Math.floor(Math.random() * players.length)

    // Get start level from room settings
    const startLevel = room.settings?.startLevel ?? 5

    // Update room status to 'playing'
    const { error: updateRoomError } = await supabaseAdmin
      .from('game_rooms')
      .update({ status: 'playing' })
      .eq('room_code', roomCode.toUpperCase())

    if (updateRoomError) {
      console.error('Error updating room status:', updateRoomError)
      return new Response(
        JSON.stringify({ error: 'Failed to start game', details: updateRoomError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create initial game state (without question - client will fetch first question)
    const { data: gameState, error: gameStateError } = await supabaseAdmin
      .from('game_state')
      .insert({
        room_code: roomCode.toUpperCase(),
        current_level: startLevel,
        current_player_index: randomPlayerIndex,
        current_question: null, // Will be set by client
        question_count: 0,
        asked_questions: []
      })
      .select()
      .single()

    if (gameStateError) {
      console.error('Error creating game state:', gameStateError)

      // Rollback room status
      await supabaseAdmin
        .from('game_rooms')
        .update({ status: 'lobby' })
        .eq('room_code', roomCode.toUpperCase())

      return new Response(
        JSON.stringify({ error: 'Failed to initialize game state', details: gameStateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return success with initial game state
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Game started successfully',
        gameState: {
          roomCode: gameState.room_code,
          currentLevel: gameState.current_level,
          currentPlayerIndex: gameState.current_player_index,
          currentQuestion: gameState.current_question,
          questionCount: gameState.question_count
        },
        players: players.map((p, idx) => ({
          playerId: p.player_id,
          playerName: p.player_name,
          isHost: p.is_host,
          isCurrentPlayer: idx === randomPlayerIndex
        }))
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
