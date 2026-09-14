/*
 * The keyboard's Battery Service over BLE. The keyboard reports its charge over the standard
 * GATT Battery Service (0x180F); the dongle reads it and, through main.c, passes it to the host
 * so createflow can show the charge without a cable.
 */
#pragma once

#include <zephyr/bluetooth/conn.h>

/* Start discovering and reading the battery level on this connection. Call once the link is
 * encrypted and no other discovery is running; a keyboard without the service leaves it unknown. */
void battery_discover(struct bt_conn *conn);

/* Forget the level on disconnect. */
void battery_reset(void);

/* -1 when unknown, otherwise 0..100. */
int battery_level(void);

/* Called whenever the level changes, so the caller can report it. */
void battery_on_change(void (*cb)(void));
