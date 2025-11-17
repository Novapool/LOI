// Edge Function: next-turn
// Advances the game to the next turn, handles level transitions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NextTurnRequest {
  roomCode: string
  playerId: string // Current player who clicked "Done Answering"
  currentQuestion: string // Question that was just answered
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const { roomCode, playerId, currentQuestion }: NextTurnRequest = await req.json()

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

    // Get current game state
    const { data: gameState, error: gameStateError } = await supabaseAdmin
      .from('game_state')
      .select('*')
      .eq('room_code', roomCode.toUpperCase())
      .single()

    if (gameStateError || !gameState) {
      return new Response(
        JSON.stringify({ error: 'Game state not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get room settings
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

    // Check if game is still playing
    if (room.status !== 'playing') {
      return new Response(
        JSON.stringify({ error: 'Game is not currently playing' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get all active players
    const { data: players, error: playersError } = await supabaseAdmin
      .from('game_players')
      .select('*')
      .eq('room_code', roomCode.toUpperCase())
      .order('joined_at', { ascending: true })

    if (playersError || !players || players.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No players found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify requester is the current player
    const currentPlayer = players[gameState.current_player_index]
    if (!currentPlayer || currentPlayer.player_id !== playerId) {
      return new Response(
        JSON.stringify({ error: 'Only the current player can advance the turn' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Increment question count
    let newQuestionCount = gameState.question_count + 1
    let newLevel = gameState.current_level

    // Get questions per level from settings
    const questionsPerLevel = room.settings?.questionsPerLevel ?? 3

    // Check if we need to decrease level
    if (newQuestionCount >= questionsPerLevel) {
      if (newLevel > 1) {
        newLevel -= 1
        newQuestionCount = 0
      } else {
        // Game finished (reached level 1 and completed all questions)
        await supabaseAdmin
          .from('game_rooms')
          .update({ status: 'finished' })
          .eq('room_code', roomCode.toUpperCase())

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Game finished!',
            gameFinished: true,
            finalLevel: 1
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
    }

    // Select next player (random, but not the same as current)
    let nextPlayerIndex = gameState.current_player_index
    if (players.length > 1) {
      do {
        nextPlayerIndex = Math.floor(Math.random() * players.length)
      } while (nextPlayerIndex === gameState.current_player_index)
    }

    // Track asked questions
    const askedQuestions = (gameState.asked_questions as string[]) || []
    if (currentQuestion && !askedQuestions.includes(currentQuestion)) {
      askedQuestions.push(currentQuestion)
    }

    // Update game state
    const { data: updatedGameState, error: updateError } = await supabaseAdmin
      .from('game_state')
      .update({
        current_level: newLevel,
        current_player_index: nextPlayerIndex,
        current_question: null, // Client will set new question
        question_count: newQuestionCount,
        asked_questions: askedQuestions,
        updated_at: new Date().toISOString()
      })
      .eq('room_code', roomCode.toUpperCase())
      .select()
      .single()

    if (updateError) {
      console.error('Error updating game state:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update game state', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return updated state
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Turn advanced successfully',
        gameState: {
          roomCode: updatedGameState.room_code,
          currentLevel: updatedGameState.current_level,
          currentPlayerIndex: updatedGameState.current_player_index,
          currentQuestion: updatedGameState.current_question,
          questionCount: updatedGameState.question_count
        },
        nextPlayer: {
          playerId: players[nextPlayerIndex].player_id,
          playerName: players[nextPlayerIndex].player_name
        },
        levelChanged: newLevel !== gameState.current_level
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
