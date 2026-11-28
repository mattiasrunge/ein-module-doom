//
// Copyright(C) 2005-2014 Simon Howard
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
//	The server of a game EiN hosts, for the doom-server service's worker
//	(lib/server-worker.ts), in place of Crispy's dedicated server
//	(d_dedicated.c, net_dedicated.c): Crispy's own server, which runs
//	no game, only passes each player's ticcmds to the others, with no
//	loop of its own. ein_start sets it up with the game's settings;
//	the worker calls ein_tick every few milliseconds, which reads what
//	came and sends what is due.
//
//	Its command line: -deathmatch or -altdeath (cooperative without
//	either), -warp <episode> <map>, -skill <1-5>, -players <n>, and
//	-servername <name>, what the games' own search for servers lists
//	it as.
//

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <emscripten.h>

#include "doomtype.h"
#include "i_system.h"
#include "i_timer.h"
#include "m_argv.h"
#include "m_misc.h"
#include "net_defs.h"
#include "net_sdl.h"
#include "net_server.h"

// Who plays, as ein_status answers it.
static char status[4096];

EMSCRIPTEN_KEEPALIVE
void ein_start(int argc, char **argv)
{
    int i;

    myargc = argc;
    myargv = malloc(argc * sizeof(char *));
    for (i = 0; i < argc; i++)
    {
        myargv[i] = M_StringDuplicate(argv[i]);
    }

    ein_hosted = true;
    ein_hosted_deathmatch = M_ParmExists("-altdeath") ? 2
                          : M_ParmExists("-deathmatch") ? 1 : 0;

    i = M_CheckParmWithArgs("-warp", 2);
    if (i > 0)
    {
        ein_hosted_episode = atoi(myargv[i + 1]);
        ein_hosted_map = atoi(myargv[i + 2]);
    }

    i = M_CheckParmWithArgs("-skill", 1);
    if (i > 0)
    {
        ein_hosted_skill = atoi(myargv[i + 1]) - 1;
    }

    i = M_CheckParmWithArgs("-players", 1);
    if (i > 0)
    {
        ein_hosted_max_players = atoi(myargv[i + 1]);
    }

    NET_SV_Init();
    NET_SV_AddModule(&net_sdl_module);
}

EMSCRIPTEN_KEEPALIVE
void ein_tick(void)
{
    NET_SV_Run();
}

// Who plays: {"map": "", "players": [{"name", "address"}]}, the server
// knowing no map but the one it started on.
EMSCRIPTEN_KEEPALIVE
const char *ein_status(void)
{
    NET_SV_EIN_Status(status, sizeof(status));
    return status;
}

// The player at the address `ip` (a.b.c.d as one number) left: their
// link to the game closed.
EMSCRIPTEN_KEEPALIVE
void ein_left(unsigned int ip)
{
    NET_SV_EIN_Drop(ip);
}

// What the server's files call of i_system.c and i_timer.c, which need
// SDL and the game for the rest.

void I_Error(const char *error, ...)
{
    char message[512];
    va_list args;

    va_start(args, error);
    M_vsnprintf(message, sizeof(message), error, args);
    va_end(args);

    fprintf(stderr, "%s\n", message);
    emscripten_force_exit(1);
}

void *I_Realloc(void *ptr, size_t size)
{
    void *new_ptr = realloc(ptr, size);

    if (size != 0 && new_ptr == NULL)
    {
        I_Error("I_Realloc: failed on reallocation of %zu bytes", size);
    }

    return new_ptr;
}

void I_AtExit(atexit_func_t func, boolean run_on_error)
{
}

int I_GetTimeMS(void)
{
    return (int) emscripten_get_now();
}

int I_GetTime(void)
{
    return I_GetTimeMS() * TICRATE / 1000;
}

void I_Sleep(int ms)
{
}
