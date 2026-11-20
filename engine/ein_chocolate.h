//
// Copyright(C) 2026 The ein-module-doom authors
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// DESCRIPTION:
//	What Chocolate Doom's OPL music (i_oplmusic.c, midifile.c) takes
//	from Chocolate Doom's own headers that doomgeneric's lack. The
//	build includes it ahead of every file.
//

#ifndef EIN_CHOCOLATE_H
#define EIN_CHOCOLATE_H

#include <stdlib.h>

// Which DMX OPL driver's quirks to copy.
typedef enum
{
    opl_doom1_1_666,
    opl_doom2_1_666,
    opl_doom_1_9
} opl_driver_ver_t;

#define PACKED_STRUCT(...) struct __VA_ARGS__ __attribute__((packed))

// A MIDI file is big-endian; WebAssembly is little-endian.
#define SDL_SwapBE16(x) __builtin_bswap16(x)
#define SDL_SwapBE32(x) __builtin_bswap32(x)

#define I_Realloc(ptr, size) realloc(ptr, size)

#endif
