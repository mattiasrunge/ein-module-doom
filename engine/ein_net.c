//
// Copyright(C) 2026 The ein-module-doom authors
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// DESCRIPTION:
//	Joining a game EiN hosts, from the game's start (the page's Join)
//	or from its menu, while whatever was on goes on underneath until
//	the game starts. Nothing here waits: each step is taken as the
//	worker asks for a frame (ein_tick), since the network brings
//	nothing while the engine runs, and the screen says what is
//	happening meanwhile.
//
//	The game's menu finds the games hosted for it with Crispy's own
//	search for games on the local network (EIN_Search): a broadcast,
//	which the page's network passes to every server of the game.
//
//	A game being played when this player comes is played through from
//	its first tic to the one they join at, as a demo plays, from the
//	tics the server kept (NET_CL_EIN_HistoryTic): silent and unseen,
//	as many a frame as fit in its time. Then this player's game is
//	where everyone else's is, and they join it at that tic, as every
//	other player's game is told in the tic's ticcmds.
//

#include <stdio.h>
#include <string.h>

#include <emscripten.h>

#include "doomtype.h"
#include "d_loop.h"
#include "i_system.h"
#include "i_timer.h"
#include "i_video.h"
#include "m_misc.h"
#include "net_client.h"
#include "net_defs.h"
#include "net_io.h"
#include "net_query.h"
#include "net_sdl.h"

#ifdef EIN_DOOM
#include "doomstat.h"
#elif defined(EIN_HERETIC)
#include "doomdef.h"
#else
#include "h2def.h"
#endif

// The game's own (its d_net.c and menu, patched by multiplayer.patch).
void EIN_ConnectData(net_connect_data_t *connect_data);
void EIN_SaveGameSettings(net_gamesettings_t *settings);
void EIN_StartNetGame(net_gamesettings_t *settings);
void EIN_DrawStatus(const char *text);

// How long a frame plays the tics before the join tic for, and how long
// a failure to join stays on the screen.
#define REPLAY_MS 30
#define FAILED_MS 4000

// The most games the search lists, how often it asks again, and how
// long a game that stopped answering stays listed.
#define MAX_FOUND 8
#define SEARCH_MS 3000
#define FORGET_MS 7000

// Whether the game has a network: the page's, when the game can be
// played together.
EM_JS(int, ein_net_here, (void), {
    return Module.einNet ? 1 : 0;
});

typedef enum
{
    JOIN_NONE,
    JOIN_ASKED,
    JOIN_CONNECTING,
    JOIN_LAUNCHING,
    JOIN_STARTING,
    JOIN_REPLAYING,
    JOIN_FAILED,
} join_state_t;

static join_state_t state = JOIN_NONE;
static net_addr_t *join_addr;
static int player_class;
static int failed_at;
static char status[160];

static void Fail(const char *why)
{
    M_snprintf(status, sizeof(status), "Could not join the game:\n%s",
               why != NULL ? why : "the server did not say why");
    printf("%s\n", status);
    state = JOIN_FAILED;
    failed_at = I_GetTimeMS();
}

// The class this player joins with: Hexen's, as the server has it.
int EIN_PlayerClass(void)
{
    return player_class;
}

boolean EIN_Joining(void)
{
    return state != JOIN_NONE && state != JOIN_FAILED;
}

// Join the game at the address `addr` (one of net_sdl_module's), as a
// player of the class `class` (Hexen's; 0 in the other games), from the
// next frame on: the menu asks from inside the game's tics, which go on
// alone until then.
void EIN_NetJoinAddress(net_addr_t *addr, int class)
{
    if (EIN_Joining() || netgame)
    {
        return;
    }

    NET_ReferenceAddress(addr);
    join_addr = addr;
    player_class = class;
    M_StringCopy(status, "Connecting to the game...", sizeof(status));
    state = JOIN_ASKED;
}

static void Connect(void)
{
    net_connect_data_t connect_data;
    net_addr_t *addr = join_addr;

    join_addr = NULL;
    EIN_ConnectData(&connect_data);
    connect_data.player_class = player_class;

    if (NET_CL_EIN_StartConnect(addr, &connect_data))
    {
        state = JOIN_CONNECTING;
    }
    else
    {
        Fail(net_client_reject_reason);
    }

    NET_ReleaseAddress(addr);
}

#ifdef EIN_HEXEN
// Hexen's player chooses their class first (its menu).
void EIN_JoinWith(net_addr_t *addr);
#else
static void EIN_JoinWith(net_addr_t *addr)
{
    EIN_NetJoinAddress(addr, 0);
}
#endif

// Join the game at `address`, a.b.c.d on the page's network.
void EIN_NetJoin(const char *address)
{
    net_addr_t *addr;

    if (!net_sdl_module.InitClient())
    {
        Fail("there is no network here to join it over");
        return;
    }

    addr = net_sdl_module.ResolveAddress(address);

    if (addr == NULL)
    {
        Fail("its address is not one");
        return;
    }

    NET_ReferenceAddress(addr);
    EIN_JoinWith(addr);
    NET_ReleaseAddress(addr);
}

// The games the search found, each by its address and its line in the
// menu, and when it last answered.

typedef struct
{
    net_addr_t *addr;
    char line[48];
    int heard_at;
} found_t;

static found_t found[MAX_FOUND];
static int num_found;
static int searched_at = -1;
static net_connect_data_t ours;

static void Heard(net_addr_t *addr, net_querydata_t *data,
                  unsigned int ping_time, void *user_data)
{
    int i;

    if (data->gamemode != ours.gamemode
     || data->gamemission != ours.gamemission)
    {
        return;
    }

    for (i = 0; i < num_found && found[i].addr != addr; ++i);

    if (i == num_found)
    {
        if (num_found == MAX_FOUND)
        {
            return;
        }
        NET_ReferenceAddress(addr);
        found[num_found++].addr = addr;
    }

    M_snprintf(found[i].line, sizeof(found[i].line), "%s  %d/%d",
               data->description, data->num_players, data->max_players);
    found[i].heard_at = I_GetTimeMS();
}

// Whether games can be joined here: the game has a network.
boolean EIN_CanJoin(void)
{
    return ein_net_here() != 0;
}

// Look for the games hosted for this game, while the menu that lists
// them is up: asked again every few seconds, and those that stopped
// answering are left out.
void EIN_Search(void)
{
    int now = I_GetTimeMS();
    int i;

    if (!EIN_CanJoin() || !net_sdl_module.InitClient())
    {
        return;
    }

    if (searched_at < 0 || now - searched_at > SEARCH_MS)
    {
        if (searched_at < 0)
        {
            EIN_ConnectData(&ours);
        }
        NET_StartLANQuery();
        searched_at = now;
    }

    for (i = 0; i < MAX_FOUND * 2; ++i)
    {
        NET_Query_Poll(Heard, NULL);
    }

    for (i = 0; i < num_found; )
    {
        if (now - found[i].heard_at > FORGET_MS)
        {
            NET_ReleaseAddress(found[i].addr);
            found[i] = found[--num_found];
        }
        else
        {
            ++i;
        }
    }
}

int EIN_Found(void)
{
    return num_found;
}

// The `i`th game found as the menu lists it: whose it is, and how many
// play of how many may.
const char *EIN_FoundLine(int i)
{
    return i < num_found ? found[i].line : "";
}

void EIN_JoinFound(int i)
{
    if (i < num_found)
    {
        EIN_JoinWith(found[i].addr);
    }
}

// Now that this player's game is where everyone's is, they watch a
// player who plays until their own place does.
static void Watch(void)
{
    int i;

    if (playeringame[displayplayer] && players[displayplayer].mo != NULL)
    {
        return;
    }

    for (i = 0; i < MAXPLAYERS; ++i)
    {
        if (playeringame[i] && players[i].mo != NULL)
        {
            displayplayer = i;
            return;
        }
    }
}

// Play as many tics before the join tic as there are and fit in the
// frame's time; true once the last of them has been played.
static boolean Replay(void)
{
    ticcmd_t cmds[NET_MAXPLAYERS];
    boolean ingame[NET_MAXPLAYERS];
    int joined[NET_MAXPLAYERS];
    int start = I_GetTimeMS();

    while (NET_CL_EIN_HistoryPlayed() < net_client_join_tic
        && I_GetTimeMS() - start < REPLAY_MS
        && NET_CL_EIN_HistoryTic(cmds, ingame, joined))
    {
        D_EIN_PlayTic(cmds, ingame, joined);
    }

    return NET_CL_EIN_HistoryPlayed() >= net_client_join_tic;
}

// Take the next step of joining; true while joining, when the frame is
// this, false when the game's own frame is to run.
boolean EIN_NetFrame(void)
{
    net_gamesettings_t settings;
    int result;

    switch (state)
    {
        case JOIN_NONE:
            return false;

        case JOIN_FAILED:
            if (I_GetTimeMS() - failed_at > FAILED_MS)
            {
                state = JOIN_NONE;
                return false;
            }
            break;

        case JOIN_ASKED:
            Connect();
            break;

        case JOIN_CONNECTING:
            result = NET_CL_EIN_Connecting();
            if (result < 0)
            {
                Fail(net_client_reject_reason);
            }
            else if (result > 0)
            {
                state = JOIN_LAUNCHING;
            }
            break;

        case JOIN_LAUNCHING:
            NET_CL_Run();
            if (!net_client_connected)
            {
                Fail("the server closed the connection");
            }
            else if (NET_CL_EIN_Launched())
            {
                EIN_SaveGameSettings(&settings);
                D_EIN_GameSettings(&settings);
                NET_CL_StartGame(&settings);
                state = JOIN_STARTING;
            }
            break;

        case JOIN_STARTING:
            NET_CL_Run();
            if (!net_client_connected)
            {
                Fail("the server closed the connection");
                break;
            }
            if (!NET_CL_GetSettings(&settings))
            {
                break;
            }
            D_EIN_StartNetGame(&settings, player_class);
            ein_replaying = net_client_late;
            EIN_StartNetGame(&settings);
            if (!net_client_late)
            {
                state = JOIN_NONE;
                return false;
            }
            state = JOIN_REPLAYING;
            // fall through

        case JOIN_REPLAYING:
            NET_CL_Run();
            if (!net_client_connected)
            {
                I_Error("The connection to the server was lost while joining "
                        "the game.");
            }
            if (Replay())
            {
                ein_replaying = false;
                NET_CL_EIN_Joined();
                D_EIN_Play();
                Watch();
                state = JOIN_NONE;
                return false;
            }
            M_snprintf(status, sizeof(status),
                       "Joining the game: catching up, %u%%",
                       net_client_join_tic
                         ? NET_CL_EIN_HistoryPlayed() * 100 / net_client_join_tic
                         : 100);
            break;
    }

    EIN_DrawStatus(status);
    I_FinishUpdate();
    return true;
}
