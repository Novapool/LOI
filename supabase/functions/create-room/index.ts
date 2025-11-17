// Edge Function: create-room
// Creates a new game room and adds the creator as host

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateRoomRequest {
  playerName: string
  playerId: string
  settings?: {
    startLevel?: number
    questionsPerLevel?: number
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const { playerName, playerId, settings }: CreateRoomRequest = await req.json()

    // Validation
    if (!playerName || !playerId) {
      return new Response(
        JSON.stringify({ error: 'playerName and playerId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (playerName.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'playerName cannot be empty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate unique 4-character room code
    const generateRoomCode = (): string => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      let code = ''
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length))
      }
      return code
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Try to generate a unique room code (max 5 attempts)
    let roomCode: string = ''
    let attempts = 0
    let codeExists = true

    while (codeExists && attempts < 5) {
      roomCode = generateRoomCode()
      const { data } = await supabaseAdmin
        .from('game_rooms')
        .select('room_code')
        .eq('room_code', roomCode)
        .single()

      codeExists = data !== null
      attempts++
    }

    if (codeExists) {
      return new Response(
        JSON.stringify({ error: 'Failed to generate unique room code. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Default settings
    const gameSettings = {
      startLevel: settings?.startLevel ?? 5,
      questionsPerLevel: settings?.questionsPerLevel ?? 3
    }

    // Create room
    const { data: room, error: roomError } = await supabaseAdmin
      .from('game_rooms')
      .insert({
        room_code: roomCode,
        host_id: playerId,
        status: 'lobby',
        settings: gameSettings
      })
      .select()
      .single()

    if (roomError) {
      console.error('Error creating room:', roomError)
      return new Response(
        JSON.stringify({ error: 'Failed to create room', details: roomError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Add creator as first player
    const { data: player, error: playerError } = await supabaseAdmin
      .from('game_players')
      .insert({
        room_code: roomCode,
        player_id: playerId,
        player_name: playerName.trim(),
        is_host: true
      })
      .select()
      .single()

    if (playerError) {
      // Rollback room creation if player creation fails
      await supabaseAdmin
        .from('game_rooms')
        .delete()
        .eq('room_code', roomCode)

      console.error('Error adding player:', playerError)
      return new Response(
        JSON.stringify({ error: 'Failed to add player to room', details: playerError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return success with room details
    return new Response(
      JSON.stringify({
        success: true,
        room: {
          roomCode: room.room_code,
          hostId: room.host_id,
          status: room.status,
          settings: room.settings,
          createdAt: room.created_at
        },
        player: {
          playerId: player.player_id,
          playerName: player.player_name,
          isHost: player.is_host
        }
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
