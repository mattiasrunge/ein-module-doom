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
//	Crispy Doom's network module, in place of net_sdl.c's UDP: the
//	datagrams go through the network the page's engine worker or the
//	server's worker gives the game (Module.einNet, the games module's
//	lib/net.ts), carried over EiN's socket nodes. Nothing here opens a
//	real socket: the one socket is a port of that network, and an
//	address the made-up one it gives each end, 10.66.x.y. A server
//	listens on Doom's own port, 2342; a broadcast, the search for
//	games, goes to every server of the game on the network.
//

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <emscripten.h>

#include "doomtype.h"
#include "i_system.h"
#include "m_misc.h"
#include "net_defs.h"
#include "net_io.h"
#include "net_packet.h"
#include "net_sdl.h"

#define DEFAULT_PORT 2342

// The longest datagram read; the network carries whole datagrams.
#define MAX_DATAGRAM 65535

// Opens the socket at `port`, or at a free one when it is 0; answers
// its port, or -1 when there is no network to open it on.
EM_JS(int, ein_net_open, (int port), {
    return Module.einNet ? Module.einNet.open(port) : -1;
});

// Sends `length` bytes at `data` from the socket at `from` to the
// address `ip` (a.b.c.d as one big-endian number) and its port `to`.
EM_JS(void, ein_net_send, (int from, unsigned int ip, int to, const void *data, int length), {
    if (Module.einNet) Module.einNet.send(from, ip >>> 0, to, HEAPU8.slice(data, data + length));
});

// The next datagram for the socket at `port`: its bytes into `data`, at
// most `max`, and who sent it into `ip` and `from`. Answers its length,
// or -1 when none is waiting; a longer one than `max` is dropped.
EM_JS(int, ein_net_recv, (int port, unsigned int *ip, int *from, void *data, int max), {
    if (!Module.einNet) return -1;
    for (;;) {
        var packet = Module.einNet.recv(port);
        if (!packet) return -1;
        if (packet.data.length > max) continue;
        HEAPU8.set(packet.data, data);
        HEAPU32[ip >> 2] = packet.ip;
        HEAP32[from >> 2] = packet.port;
        return packet.data.length;
    }
});

typedef struct
{
    net_addr_t net_addr;
    unsigned int ip;
    int port;
} ein_addr_t;

static int socket_port = -1;
static byte *received;
static ein_addr_t **addresses;
static int num_addresses;

// The address `ip`:`port`, one entry for each, as net_sdl.c keeps them,
// so that the same address is always the same net_addr_t.
static net_addr_t *FindAddress(unsigned int ip, int port)
{
    ein_addr_t *entry;
    int i;

    for (i = 0; i < num_addresses; ++i)
    {
        if (addresses[i] != NULL && addresses[i]->ip == ip
         && addresses[i]->port == port)
        {
            return &addresses[i]->net_addr;
        }
    }

    for (i = 0; i < num_addresses && addresses[i] != NULL; ++i);

    if (i == num_addresses)
    {
        num_addresses = num_addresses ? num_addresses * 2 : 16;
        addresses = I_Realloc(addresses, num_addresses * sizeof(*addresses));
        memset(addresses + i, 0, (num_addresses - i) * sizeof(*addresses));
    }

    entry = malloc(sizeof(ein_addr_t));
    entry->ip = ip;
    entry->port = port;
    entry->net_addr.refcount = 0;
    entry->net_addr.handle = entry;
    entry->net_addr.module = &net_sdl_module;
    addresses[i] = entry;

    return &entry->net_addr;
}

static void NET_EIN_FreeAddress(net_addr_t *addr)
{
    int i;

    for (i = 0; i < num_addresses; ++i)
    {
        if (addresses[i] != NULL && addr == &addresses[i]->net_addr)
        {
            free(addresses[i]);
            addresses[i] = NULL;
            return;
        }
    }

    I_Error("NET_EIN_FreeAddress: Attempted to remove an unused address!");
}

static boolean OpenSocket(int port)
{
    if (socket_port >= 0)
    {
        return true;
    }

    socket_port = ein_net_open(port);

    if (socket_port < 0)
    {
        return false;
    }

    received = malloc(MAX_DATAGRAM);
    return true;
}

static boolean NET_EIN_InitClient(void)
{
    return OpenSocket(0);
}

static boolean NET_EIN_InitServer(void)
{
    return OpenSocket(DEFAULT_PORT);
}

static void NET_EIN_SendPacket(net_addr_t *addr, net_packet_t *packet)
{
    ein_addr_t *to;

    if (socket_port < 0)
    {
        return;
    }

    if (addr == &net_broadcast_addr)
    {
        ein_net_send(socket_port, 0xffffffff, DEFAULT_PORT, packet->data,
                     packet->len);
        return;
    }

    to = addr->handle;
    ein_net_send(socket_port, to->ip, to->port, packet->data, packet->len);
}

static boolean NET_EIN_RecvPacket(net_addr_t **addr, net_packet_t **packet)
{
    unsigned int ip;
    int port;
    int length;

    if (socket_port < 0)
    {
        return false;
    }

    length = ein_net_recv(socket_port, &ip, &port, received, MAX_DATAGRAM);

    if (length < 0)
    {
        return false;
    }

    *packet = NET_NewPacket(length);
    memcpy((*packet)->data, received, length);
    (*packet)->len = length;
    *addr = FindAddress(ip, port);

    return true;
}

// An address as numbers, a.b.c.d, with its port after it when it is
// not Doom's own, as net_sdl.c writes it.
static void NET_EIN_AddrToString(net_addr_t *addr, char *buffer, int buffer_len)
{
    ein_addr_t *at = addr->handle;

    M_snprintf(buffer, buffer_len, "%u.%u.%u.%u", (at->ip >> 24) & 0xff,
               (at->ip >> 16) & 0xff, (at->ip >> 8) & 0xff, at->ip & 0xff);

    if (at->port != DEFAULT_PORT)
    {
        char port[10];

        M_snprintf(port, sizeof(port), ":%i", at->port);
        M_StringConcat(buffer, port, buffer_len);
    }
}

// An address as numbers, a.b.c.d with :port or without, which takes
// Doom's own port: the network has no names to look up.
static net_addr_t *NET_EIN_ResolveAddress(const char *address)
{
    unsigned int ip[4];
    unsigned int port = DEFAULT_PORT;
    int found = sscanf(address, "%u.%u.%u.%u:%u", &ip[0], &ip[1], &ip[2],
                       &ip[3], &port);

    if ((found != 4 && found != 5) || ip[0] > 255 || ip[1] > 255
     || ip[2] > 255 || ip[3] > 255 || port > 65535)
    {
        return NULL;
    }

    return FindAddress((ip[0] << 24) | (ip[1] << 16) | (ip[2] << 8) | ip[3],
                       port);
}

// The address `addr` is at, a.b.c.d as one number: what EiN knows a
// player by, whatever port their game's socket is at.
unsigned int NET_EIN_AddrIp(net_addr_t *addr)
{
    return ((ein_addr_t *) addr->handle)->ip;
}

net_module_t net_sdl_module =
{
    NET_EIN_InitClient,
    NET_EIN_InitServer,
    NET_EIN_SendPacket,
    NET_EIN_RecvPacket,
    NET_EIN_AddrToString,
    NET_EIN_FreeAddress,
    NET_EIN_ResolveAddress,
};
