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
//	What Crispy Doom has that the module's engine has no use for, in
//	place of the files that need SDL for it: a joystick (the page
//	hands over keys and the mouse only), the ENDOOM screen shown on
//	Quit, Heretic's text-mode and Hexen's 640 by 480 startup screens
//	(both start printing lines, which the page shows) and the network's
//	text-mode waiting screen, which a game EiN hosts has no use for
//	(ein_net.c starts it).
//

#include <stddef.h>

#include "doomtype.h"
#include "i_endoom.h"
#include "i_joystick.h"
#include "i_videohr.h"
#include "net_defs.h"
#include "net_gui.h"
#include "txt_io.h"
#include "txt_main.h"

int use_analog = 0;
int joystick_turn_sensitivity = 10;
int joystick_move_sensitivity = 10;
int joystick_look_sensitivity = 10;

void I_InitJoystick(void)
{
}

void I_ShutdownJoystick(void)
{
}

void I_UpdateJoystick(void)
{
}

void I_BindJoystickVariables(void)
{
}

void I_Endoom(byte *data)
{
}

// Heretic draws its startup screen in text mode once TXT_Init has
// started it, and prints otherwise: the rest is not called.
int TXT_Init(void)
{
    return 0;
}

void TXT_Shutdown(void)
{
}

unsigned char *TXT_GetScreenData(void)
{
    return NULL;
}

void TXT_UpdateScreen(void)
{
}

int TXT_GetChar(void)
{
    return -1;
}

void TXT_PutChar(int c)
{
}

void TXT_Puts(const char *s)
{
}

void TXT_GotoXY(int x, int y)
{
}

void TXT_FGColor(txt_color_t color)
{
}

void TXT_BGColor(int color, int blinking)
{
}

boolean I_SetVideoModeHR(void)
{
    return false;
}

void I_UnsetVideoModeHR(void)
{
}

void I_SetWindowTitleHR(const char *title)
{
}

void I_ClearScreenHR(void)
{
}

void I_SlamBlockHR(int x, int y, int w, int h, const byte *src)
{
}

void I_SlamHR(const byte *buffer)
{
}

void I_InitPaletteHR(void)
{
}

void I_SetPaletteHR(const byte *palette)
{
}

void I_FadeToPaletteHR(const byte *palette)
{
}

void I_BlackPaletteHR(void)
{
}

boolean I_CheckAbortHR(void)
{
    return false;
}

void NET_WaitForLaunch(void)
{
}
