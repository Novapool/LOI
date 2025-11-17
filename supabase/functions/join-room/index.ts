// Edge Function: join-room
// Allows a player to join an existing game room

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface JoinRoomRequest {
  roomCode: string
  playerName: string
  playerId: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const { roomCode, playerName, playerId }: JoinRoomRequest = await req.json()

    // Validation
    if (!roomCode || !playerName || !playerId) {
      return new Response(
        JSON.stringify({ error: 'roomCode, playerName, and playerId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (playerName.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'playerName cannot be empty' }),
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

    // Check if game has already started
    if (room.status === 'playing') {
      return new Response(
        JSON.stringify({ error: 'Game has already started. Cannot join.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (room.status === 'finished') {
      return new Response(
        JSON.stringify({ error: 'Game has finished. Cannot join.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if player is already in the room
    const { data: existingPlayer } = await supabaseAdmin
      .from('game_players')
      .select('*')
      .eq('room_code', roomCode.toUpperCase())
      .eq('player_id', playerId)
      .single()

    if (existingPlayer) {
      // Player is already in the room, just update their heartbeat
      const { data: updatedPlayer, error: updateError } = await supabaseAdmin
        .from('game_players')
        .update({ last_heartbeat: new Date().toISOString() })
        .eq('room_code', roomCode.toUpperCase())
        .eq('player_id', playerId)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating player heartbeat:', updateError)
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Already in room. Reconnected.',
          room: {
            roomCode: room.room_code,
            hostId: room.host_id,
            status: room.status,
            settings: room.settings
          },
          player: {
            playerId: updatedPlayer?.player_id ?? playerId,
            playerName: updatedPlayer?.player_name ?? playerName,
            isHost: updatedPlayer?.is_host ?? false
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check current player count (assuming max 10 players from config)
    const { count, error: countError } = await supabaseAdmin
      .from('game_players')
      .select('*', { count: 'exact', head: true })
      .eq('room_code', roomCode.toUpperCase())

    if (countError) {
      console.error('Error counting players:', countError)
    }

    const maxPlayers = 10 // From your GAME_CONFIG
    if (count && count >= maxPlayers) {
      return new Response(
        JSON.stringify({ error: `Room is full (max ${maxPlayers} players)` }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Add player to room
    const { data: player, error: playerError } = await supabaseAdmin
      .from('game_players')
      .insert({
        room_code: roomCode.toUpperCase(),
        player_id: playerId,
        player_name: playerName.trim(),
        is_host: false
      })
      .select()
      .single()

    if (playerError) {
      console.error('Error adding player:', playerError)
      return new Response(
        JSON.stringify({ error: 'Failed to join room', details: playerError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return success
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Successfully joined room',
        room: {
          roomCode: room.room_code,
          hostId: room.host_id,
          status: room.status,
          settings: room.settings
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
