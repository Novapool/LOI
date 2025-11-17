// Edge Function: player-heartbeat
// Updates player's last_heartbeat to indicate they're still connected

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface HeartbeatRequest {
  roomCode: string
  playerId: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const { roomCode, playerId }: HeartbeatRequest = await req.json()

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

    // Update player's heartbeat
    const { data: player, error: updateError } = await supabaseAdmin
      .from('game_players')
      .update({ last_heartbeat: new Date().toISOString() })
      .eq('room_code', roomCode.toUpperCase())
      .eq('player_id', playerId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating heartbeat:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update heartbeat', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!player) {
      return new Response(
        JSON.stringify({ error: 'Player not found in room' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check for inactive players and clean them up
    const { data: inactivePlayers, error: inactiveError } = await supabaseAdmin
      .from('game_players')
      .select('*')
      .eq('room_code', roomCode.toUpperCase())
      .lt('last_heartbeat', new Date(Date.now() - 30000).toISOString()) // 30 seconds ago

    if (!inactiveError && inactivePlayers && inactivePlayers.length > 0) {
      // Remove inactive players
      const { error: deleteError } = await supabaseAdmin
        .from('game_players')
        .delete()
        .eq('room_code', roomCode.toUpperCase())
        .lt('last_heartbeat', new Date(Date.now() - 30000).toISOString())

      if (deleteError) {
        console.error('Error removing inactive players:', deleteError)
      }

      // Check if removed player was host
      const removedHost = inactivePlayers.find(p => p.is_host)
      if (removedHost) {
        // Transfer host to the next player
        const { data: remainingPlayers } = await supabaseAdmin
          .from('game_players')
          .select('*')
          .eq('room_code', roomCode.toUpperCase())
          .order('joined_at', { ascending: true })
          .limit(1)

        if (remainingPlayers && remainingPlayers.length > 0) {
          const newHost = remainingPlayers[0]

          // Update new host
          await supabaseAdmin
            .from('game_players')
            .update({ is_host: true })
            .eq('room_code', roomCode.toUpperCase())
            .eq('player_id', newHost.player_id)

          // Update room host_id
          await supabaseAdmin
            .from('game_rooms')
            .update({ host_id: newHost.player_id })
            .eq('room_code', roomCode.toUpperCase())
        } else {
          // No players left, delete the room
          await supabaseAdmin
            .from('game_rooms')
            .delete()
            .eq('room_code', roomCode.toUpperCase())
        }
      }
    }

    // Get updated player list
    const { data: allPlayers, count } = await supabaseAdmin
      .from('game_players')
      .select('*', { count: 'exact' })
      .eq('room_code', roomCode.toUpperCase())

    // Return success with updated info
    return new Response(
      JSON.stringify({
        success: true,
        playerCount: count ?? 0,
        isAlive: true
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
