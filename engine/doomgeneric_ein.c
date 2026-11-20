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
//	doomgeneric's platform layer for the EiN page: no SDL, no window
//	and no loop of its own. The page drives the game: it writes the
//	WADs into Emscripten's in-memory file system, calls ein_start
//	once, then ein_tick from requestAnimationFrame, copies the frame
//	from ein_screen onto its canvas whenever ein_frames moves on, and
//	hands over keys with ein_key, already in Doom's key codes. Sound
//	is ein_sound.c and opl_ein.c.
//

#include <stdint.h>

#include <emscripten.h>

#include "doomgeneric.h"
#include "i_sound.h"

// Keys the page handed over that the game has not read yet. A frame
// reads them all, so this only needs to hold one frame's worth.
#define KEY_QUEUE_SIZE 64

static uint16_t key_queue[KEY_QUEUE_SIZE];
static unsigned int key_write = 0;
static unsigned int key_read = 0;

// How many frames the game has finished: the page blits when it moves.
static uint32_t frames = 0;

void DG_Init()
{
}

void DG_DrawFrame()
{
    frames++;
}

// The page owns the loop, so there is nothing to sleep for: Doom's own
// waits are short spins on DG_GetTicksMs, which keeps moving.
void DG_SleepMs(uint32_t ms)
{
}

uint32_t DG_GetTicksMs()
{
    return (uint32_t) emscripten_get_now();
}

int DG_GetKey(int *pressed, unsigned char *key)
{
    if (key_read == key_write)
    {
        return 0;
    }
    uint16_t data = key_queue[key_read];
    key_read = (key_read + 1) % KEY_QUEUE_SIZE;
    *pressed = data >> 8;
    *key = data & 0xff;
    return 1;
}

void DG_SetWindowTitle(const char *title)
{
}

// Start the game on the IWAD at `iwad` in the in-memory file system,
// with the PWAD at `pwad` over it unless that is empty, its music made
// at `samplerate`, the page's. It returns after the first tick;
// ein_tick runs the rest.
EMSCRIPTEN_KEEPALIVE
void ein_start(const char *iwad, const char *pwad, int samplerate)
{
    static char *argv[] = { "doom", "-iwad", NULL, "-file", NULL, NULL };
    argv[2] = (char *) iwad;
    argv[4] = (char *) pwad;
    snd_samplerate = samplerate;
    doomgeneric_Create(pwad[0] != '\0' ? 5 : 3, argv);
}

// Run whatever tics are due and draw a frame.
EMSCRIPTEN_KEEPALIVE
void ein_tick()
{
    doomgeneric_Tick();
}

// A key went down (`pressed` 1) or up (0); `key` is a Doom key code. A
// full queue drops the key rather than overwrite one not yet read.
EMSCRIPTEN_KEEPALIVE
void ein_key(int pressed, int key)
{
    unsigned int next = (key_write + 1) % KEY_QUEUE_SIZE;
    if (next == key_read)
    {
        return;
    }
    key_queue[key_write] = (uint16_t) (((pressed ? 1 : 0) << 8) | (key & 0xff));
    key_write = next;
}

// Where the frame is: DOOMGENERIC_RESX by DOOMGENERIC_RESY pixels of
// 0x00RRGGBB.
EMSCRIPTEN_KEEPALIVE
uint32_t *ein_screen()
{
    return DG_ScreenBuffer;
}

EMSCRIPTEN_KEEPALIVE
int ein_width()
{
    return DOOMGENERIC_RESX;
}

EMSCRIPTEN_KEEPALIVE
int ein_height()
{
    return DOOMGENERIC_RESY;
}

EMSCRIPTEN_KEEPALIVE
uint32_t ein_frames()
{
    return frames;
}
