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
//	The engine's entry for the module's worker (ui/doom/engine-worker.ts),
//	in place of i_main.c: Crispy Doom, Heretic or Hexen with no loop of
//	its own. The worker puts the WADs and the player's files in
//	Emscripten's file system and calls ein_start once, which starts the
//	game as main did; the game's loop (loop.patch) hands its frame to
//	EIN_MainLoop rather than run it forever, and ein_tick runs it each
//	time the page asks for a frame. The settings files are in the
//	configuration directory, / (ein_sdl.c), the saves in -savedir; the
//	worker reads what the game wrote there after each tick.
//

#include <locale.h>
#include <stdlib.h>

#include <emscripten.h>

#include "SDL.h"

#include "config.h"
#include "crispy.h"
#include "doomtype.h"
#include "i_sound.h"
#include "i_system.h"
#include "i_timer.h"
#include "m_argv.h"
#include "m_config.h"
#include "m_misc.h"

void D_DoomMain (void);

extern int ein_display_width;
extern int ein_display_height;

// Whether the game's menu is up: Doom's menuactive, Heretic's and
// Hexen's MenuActive. The build names the game (EIN_DOOM).
#ifdef EIN_DOOM
extern boolean menuactive;
#define MENU_ACTIVE menuactive
#else
extern boolean MenuActive;
#define MENU_ACTIVE MenuActive
#endif

// The game's frame, which its loop would have run forever.
static void (*frame)(void) = NULL;

// Joining a game EiN hosts (ein_net.c).
boolean EIN_NetFrame(void);
void EIN_NetJoin(const char *address);

// The game's loop starts: its frame is kept for ein_tick, and the
// game's start is left as Emscripten leaves a main loop, by unwinding
// the stack with the runtime kept, so that, as the loop never returned,
// nothing after it runs.
void EIN_MainLoop(void (*run_frame)(void))
{
    frame = run_frame;
    emscripten_exit_with_live_runtime();
}

// Start the game with the command line `argv` (-iwad and -file name
// the WADs in the file system), its sound mixed at `samplerate`, the
// page's, and widescreen matching a screen of `width` by `height`. Once
// the game is ready for its first frame it throws Emscripten's
// 'unwind' (EIN_MainLoop), which the worker takes for started.
EMSCRIPTEN_KEEPALIVE
void ein_start(int argc, char **argv, int samplerate, int width, int height)
{
    snd_samplerate = samplerate;
    if (width > 0 && height > 0)
    {
        ein_display_width = width;
        ein_display_height = height;
    }

    myargc = argc;
    myargv = malloc(argc * sizeof(char *));
    for (int i = 0; i < argc; i++)
    {
        myargv[i] = M_StringDuplicate(argv[i]);
    }

    // The date and time in the Load and Save Game menus.
    setlocale(LC_TIME, "");

    crispy->sdlversion = "";
    crispy->platform = "EiN";

    M_FindResponseFile();
    M_SetExeDir();

    D_DoomMain();
}

// Run whatever tics are due and draw a frame. With the frame rate
// capped at the game's 35 tics a second, a frame shows the next tic,
// and the page asks more often than that: a frame is run only once a
// tic has come since the last. While the player joins a game EiN hosts
// (ein_net.c), each frame is a step of joining it.
EMSCRIPTEN_KEEPALIVE
void ein_tick(void)
{
    static int last_tic = -1;

    if (frame == NULL || EIN_NetFrame())
    {
        return;
    }
    if (!crispy->uncapped)
    {
        int tic = I_GetTime();

        if (tic == last_tic)
        {
            return;
        }
        last_tic = tic;
    }
    frame();
}

EMSCRIPTEN_KEEPALIVE
int ein_menu(void)
{
    return MENU_ACTIVE ? 1 : 0;
}

// Write the game's settings now, as Quit does, so the player keeps them
// when the game is stopped without it or a menu closes.
EMSCRIPTEN_KEEPALIVE
void ein_save_config(void)
{
    M_SaveDefaults();
}

// Set the setting `name` to `value` as the configuration file would,
// a key by its scancode: the Keys dialog changes them as the game runs.
EMSCRIPTEN_KEEPALIVE
int ein_set_variable(const char *name, const char *value)
{
    return M_SetVariable(name, value) ? 1 : 0;
}

// Join the game EiN hosts at `address` on the page's network once the
// game has started: the page's Join. The player plays under the name
// the setting player_name has.
EMSCRIPTEN_KEEPALIVE
void ein_join(const char *address)
{
    EIN_NetJoin(address);
}
