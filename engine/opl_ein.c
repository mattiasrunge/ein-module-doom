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
//	Chocolate Doom's OPL library (opl.h) for the EiN page, on the
//	Nuked OPL3 emulator, in place of its opl.c and opl_sdl.c: no
//	driver to pick, no chip to detect, no audio thread. The page asks
//	for samples with ein_music_render as it plays them, and the music's
//	timer callbacks run in between, at the sample they are due. Since
//	the page and the game share one thread, nothing needs a lock.
//
//	OPL_InitRegisters and the timing of OPL_SetCallback and
//	ein_music_render are Chocolate Doom's opl.c and opl_sdl.c.
//

#include <stdint.h>
#include <stdlib.h>

#include <emscripten.h>

#include "opl.h"
#include "opl3.h"
#include "opl_queue.h"

unsigned int opl_sample_rate = 22050;

static opl3_chip opl_chip;
static opl_callback_queue_t *callback_queue = NULL;

// The music's own clock, in microseconds, moved on by the samples
// rendered; paused time is added to pause_offset, which holds the
// callbacks back by as much.
static uint64_t current_time = 0;
static uint64_t pause_offset = 0;
static int paused = 0;

// The register the next write to the data port goes to.
static unsigned int register_num = 0;

opl_init_result_t OPL_Init(unsigned int port_base)
{
    if (callback_queue == NULL)
    {
        callback_queue = OPL_Queue_Create();
    }
    OPL_Queue_Clear(callback_queue);
    current_time = 0;
    pause_offset = 0;
    paused = 0;
    OPL3_Reset(&opl_chip, opl_sample_rate);
    return OPL_INIT_OPL3;
}

void OPL_Shutdown(void)
{
    if (callback_queue != NULL)
    {
        OPL_Queue_Clear(callback_queue);
    }
}

void OPL_SetSampleRate(unsigned int rate)
{
    opl_sample_rate = rate;
}

void OPL_WritePort(opl_port_t port, unsigned int value)
{
    if (port == OPL_REGISTER_PORT)
    {
        register_num = value;
    }
    else if (port == OPL_REGISTER_PORT_OPL3)
    {
        register_num = value | 0x100;
    }
    else if (port == OPL_DATA_PORT)
    {
        OPL3_WriteRegBuffered(&opl_chip, register_num, value);
    }
}

// The emulator has no status to read: no timer ever expires, and only
// detection, which is not done here, would look.
unsigned int OPL_ReadPort(opl_port_t port)
{
    return 0;
}

unsigned int OPL_ReadStatus(void)
{
    return 0;
}

void OPL_WriteRegister(int reg, int value)
{
    OPL_WritePort((reg & 0x100) ? OPL_REGISTER_PORT_OPL3 : OPL_REGISTER_PORT, reg);
    OPL_WritePort(OPL_DATA_PORT, value);
}

opl_init_result_t OPL_Detect(void)
{
    return OPL_INIT_OPL3;
}

void OPL_InitRegisters(int opl3)
{
    int r;

    // The level registers, then the others, as Doom wrote them: the
    // last two loops write registers that do not exist, and the <= is
    // Doom's.
    for (r = OPL_REGS_LEVEL; r <= OPL_REGS_LEVEL + OPL_NUM_OPERATORS; ++r)
    {
        OPL_WriteRegister(r, 0x3f);
    }
    for (r = OPL_REGS_ATTACK; r <= OPL_REGS_WAVEFORM + OPL_NUM_OPERATORS; ++r)
    {
        OPL_WriteRegister(r, 0x00);
    }
    for (r = 1; r < OPL_REGS_LEVEL; ++r)
    {
        OPL_WriteRegister(r, 0x00);
    }

    // Reset both timers and enable interrupts, and let the FM chips
    // choose each operator's waveform.
    OPL_WriteRegister(OPL_REG_TIMER_CTRL, 0x60);
    OPL_WriteRegister(OPL_REG_TIMER_CTRL, 0x80);
    OPL_WriteRegister(OPL_REG_WAVEFORM_ENABLE, 0x20);

    if (opl3)
    {
        OPL_WriteRegister(OPL_REG_NEW, 0x01);
        for (r = OPL_REGS_LEVEL; r <= OPL_REGS_LEVEL + OPL_NUM_OPERATORS; ++r)
        {
            OPL_WriteRegister(r | 0x100, 0x3f);
        }
        for (r = OPL_REGS_ATTACK; r <= OPL_REGS_WAVEFORM + OPL_NUM_OPERATORS; ++r)
        {
            OPL_WriteRegister(r | 0x100, 0x00);
        }
        for (r = 1; r < OPL_REGS_LEVEL; ++r)
        {
            OPL_WriteRegister(r | 0x100, 0x00);
        }
    }

    // Keyboard split point on.
    OPL_WriteRegister(OPL_REG_FM_MODE, 0x40);

    if (opl3)
    {
        OPL_WriteRegister(OPL_REG_NEW, 0x01);
    }
}

void OPL_SetCallback(uint64_t us, opl_callback_t callback, void *data)
{
    OPL_Queue_Push(callback_queue, callback, data, current_time - pause_offset + us);
}

void OPL_AdjustCallbacks(float factor)
{
    OPL_Queue_AdjustCallbacks(callback_queue, current_time, factor);
}

void OPL_ClearCallbacks(void)
{
    OPL_Queue_Clear(callback_queue);
}

void OPL_Lock(void)
{
}

void OPL_Unlock(void)
{
}

// Only detection waits, and nothing here detects.
void OPL_Delay(uint64_t us)
{
}

void OPL_SetPaused(int _paused)
{
    paused = _paused;
}

// Move the clock on by `nsamples` and run the callbacks then due.
static void AdvanceTime(unsigned int nsamples)
{
    opl_callback_t callback;
    void *callback_data;
    uint64_t us = ((uint64_t) nsamples * OPL_SECOND) / opl_sample_rate;

    current_time += us;
    if (paused)
    {
        pause_offset += us;
    }

    while (!OPL_Queue_IsEmpty(callback_queue)
        && current_time >= OPL_Queue_Peek(callback_queue) + pause_offset)
    {
        if (!OPL_Queue_Pop(callback_queue, &callback, &callback_data))
        {
            break;
        }
        callback(callback_data);
    }
}

// Fill `buffer` with `frames` frames of interleaved 16-bit stereo,
// stopping at each callback that falls due on the way.
EMSCRIPTEN_KEEPALIVE
void ein_music_render(int16_t *buffer, unsigned int frames)
{
    unsigned int filled = 0;

    if (callback_queue == NULL)
    {
        for (filled = 0; filled < frames * 2; ++filled)
        {
            buffer[filled] = 0;
        }
        return;
    }

    while (filled < frames)
    {
        uint64_t nsamples;

        if (paused || OPL_Queue_IsEmpty(callback_queue))
        {
            nsamples = frames - filled;
        }
        else
        {
            uint64_t next = OPL_Queue_Peek(callback_queue) + pause_offset;
            nsamples = next > current_time ? next - current_time : 0;
            nsamples = (nsamples * opl_sample_rate + OPL_SECOND - 1) / OPL_SECOND;
            if (nsamples > frames - filled)
            {
                nsamples = frames - filled;
            }
        }

        OPL3_GenerateStream(&opl_chip, buffer + filled * 2, nsamples);
        filled += nsamples;
        AdvanceTime(nsamples);
    }
}
