/*
 * Software DFU trigger.
 *
 * The EBYTE E104-BT5040U sits in a closed snap-fit case; its buttons are not reachable
 * without prying it open. This trigger makes updates possible without touching the stick:
 * the host opens the dongle's serial port at 1200 baud (the same touch Arduino boards use),
 * the firmware notices the unusual rate and reboots into the bootloader.
 */
#include "bridge.h"

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/uart.h>
#include <zephyr/sys/reboot.h>
#include <zephyr/logging/log.h>
#include <hal/nrf_power.h>
#include <hal/nrf_gpio.h>

LOG_MODULE_REGISTER(dfu_trigger, LOG_LEVEL_INF);

/* Nordic's open bootloader enters DFU when it finds this value in GPREGRET
 * (BOOTLOADER_DFU_START in the nRF5 SDK). The register survives any reset but power loss. */
#define BOOTLOADER_DFU_START 0xB1

/* On the nRF52840 dongle (PCA10059 and clones) P0.19 is wired to the RESET line. Driving
 * it low produces a real pin reset, which the bootloader also treats as "enter DFU". */
#define SELF_PINRESET_PIN 19

#define DFU_BAUDRATE 1200
#define POLL_MS      250

static const struct device *const console = DEVICE_DT_GET(DT_CHOSEN(zephyr_console));

static void reboot_into_bootloader(void)
{
	LOG_INF("1200 baud touch - rebooting into the bootloader");

	nrf_power_gpregret_set(NRF_POWER, 0, BOOTLOADER_DFU_START);

	/* Pin reset first; if a clone does not route P0.19, the plain reboot below still
	 * gets there because GPREGRET survives both. */
	nrf_gpio_cfg_output(SELF_PINRESET_PIN);
	nrf_gpio_pin_clear(SELF_PINRESET_PIN);

	k_msleep(50);
	sys_reboot(SYS_REBOOT_COLD);
}

static void poll_baudrate(struct k_work *work);
static K_WORK_DELAYABLE_DEFINE(poll_work, poll_baudrate);

static void poll_baudrate(struct k_work *work)
{
	ARG_UNUSED(work);
	uint32_t baud = 0;

	/* No baud rate while the host has the port closed - that is the normal case. */
	if (uart_line_ctrl_get(console, UART_LINE_CTRL_BAUD_RATE, &baud) == 0 &&
	    baud == DFU_BAUDRATE) {
		reboot_into_bootloader();
		return;
	}
	k_work_schedule(&poll_work, K_MSEC(POLL_MS));
}

int dfu_trigger_start(void)
{
	if (!device_is_ready(console)) {
		LOG_ERR("console UART not ready - dongle only reachable via the reset button");
		return -EIO;
	}
	k_work_schedule(&poll_work, K_MSEC(POLL_MS));
	LOG_INF("DFU trigger armed (open the port at %d baud)", DFU_BAUDRATE);
	return 0;
}
