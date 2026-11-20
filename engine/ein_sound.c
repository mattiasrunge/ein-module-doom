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
//	doomgeneric's sound module for the EiN page: the sound effects
//	are played by the page on Web Audio (ui/doom/sound.ts, handed to
//	the Emscripten module as `einSound`). Each effect's samples go to
//	the page once, the first time it is played; after that only its
//	channel, volume and separation do. The music module is Chocolate
//	Doom's OPL music (i_oplmusic.c) on opl_ein.c.
//

#include <stdint.h>
#include <stdio.h>

#include <emscripten.h>

#include "doomtype.h"
#include "i_sound.h"
#include "m_misc.h"
#include "w_wad.h"
#include "z_zone.h"
#include "deh_str.h"

// Settings Chocolate Doom's SDL sound had, which the configuration
// file still names: there is no resampling here, the page does it.
int use_libsamplerate = 0;
float libsamplerate_scale = 0.65f;
char *timidity_cfg_path = "";

static boolean use_sfx_prefix;

EM_JS(void, js_sfx_load, (int lump, const uint8_t *samples, int length, int rate), {
    if (Module.einSound) Module.einSound.load(lump, HEAPU8.slice(samples, samples + length), rate);
});

EM_JS(void, js_sfx_start, (int channel, int lump, int vol, int sep), {
    if (Module.einSound) Module.einSound.start(channel, lump, vol, sep);
});

EM_JS(void, js_sfx_update, (int channel, int vol, int sep), {
    if (Module.einSound) Module.einSound.update(channel, vol, sep);
});

EM_JS(void, js_sfx_stop, (int channel), {
    if (Module.einSound) Module.einSound.stop(channel);
});

EM_JS(int, js_sfx_playing, (int channel), {
    return Module.einSound && Module.einSound.playing(channel) ? 1 : 0;
});

static void GetSfxLumpName(sfxinfo_t *sfx, char *buf, size_t buf_len)
{
    // A linked effect plays the lump of the one it links to.
    if (sfx->link != NULL)
    {
        sfx = sfx->link;
    }

    // Doom's effects are the lumps named DS<name>.
    if (use_sfx_prefix)
    {
        M_snprintf(buf, buf_len, "ds%s", DEH_String(sfx->name));
    }
    else
    {
        M_StringCopy(buf, DEH_String(sfx->name), buf_len);
    }
}

// Hand an effect's samples to the page, once. A DMX sound lump is a
// format word (3), the sample rate, the length, then that many
// unsigned 8-bit samples, of which DMX skipped the first and the last
// 16; so does this, as Chocolate Doom does.
static boolean LoadSfx(sfxinfo_t *sfxinfo)
{
    int lumpnum = sfxinfo->lumpnum;
    const uint8_t *data;
    unsigned int lumplen, rate, length;

    if (sfxinfo->driver_data != NULL)
    {
        return true;
    }

    data = W_CacheLumpNum(lumpnum, PU_STATIC);
    lumplen = W_LumpLength(lumpnum);

    if (lumplen < 8 || data[0] != 0x03 || data[1] != 0x00)
    {
        W_ReleaseLumpNum(lumpnum);
        return false;
    }

    rate = (data[3] << 8) | data[2];
    length = (data[7] << 24) | (data[6] << 16) | (data[5] << 8) | data[4];

    if (length > lumplen - 8 || length <= 48)
    {
        W_ReleaseLumpNum(lumpnum);
        return false;
    }

    js_sfx_load(lumpnum, data + 8 + 16, length - 32, rate);
    W_ReleaseLumpNum(lumpnum);

    // Anything not NULL marks it as handed over.
    sfxinfo->driver_data = sfxinfo;
    return true;
}

static boolean EIN_InitSound(boolean _use_sfx_prefix)
{
    use_sfx_prefix = _use_sfx_prefix;
    return true;
}

static void EIN_ShutdownSound(void)
{
}

static int EIN_GetSfxLumpNum(sfxinfo_t *sfx)
{
    char namebuf[9];

    GetSfxLumpName(sfx, namebuf, sizeof(namebuf));

    // A WAD without the lump plays nothing rather than stopping the game.
    return W_CheckNumForName(namebuf);
}

static void EIN_UpdateSound(void)
{
}

static void EIN_UpdateSoundParams(int channel, int vol, int sep)
{
    js_sfx_update(channel, vol, sep);
}

static int EIN_StartSound(sfxinfo_t *sfxinfo, int channel, int vol, int sep)
{
    if (sfxinfo->lumpnum < 0 || !LoadSfx(sfxinfo))
    {
        return -1;
    }

    js_sfx_start(channel, sfxinfo->lumpnum, vol, sep);
    return channel;
}

static void EIN_StopSound(int channel)
{
    js_sfx_stop(channel);
}

static boolean EIN_SoundIsPlaying(int channel)
{
    return js_sfx_playing(channel) != 0;
}

static void EIN_CacheSounds(sfxinfo_t *sounds, int num_sounds)
{
}

static snddevice_t sound_ein_devices[] =
{
    SNDDEVICE_SB,
    SNDDEVICE_PAS,
    SNDDEVICE_GUS,
    SNDDEVICE_WAVEBLASTER,
    SNDDEVICE_SOUNDCANVAS,
    SNDDEVICE_AWE32,
};

sound_module_t DG_sound_module =
{
    sound_ein_devices,
    arrlen(sound_ein_devices),
    EIN_InitSound,
    EIN_ShutdownSound,
    EIN_GetSfxLumpNum,
    EIN_UpdateSound,
    EIN_UpdateSoundParams,
    EIN_StartSound,
    EIN_StopSound,
    EIN_SoundIsPlaying,
    EIN_CacheSounds,
};
