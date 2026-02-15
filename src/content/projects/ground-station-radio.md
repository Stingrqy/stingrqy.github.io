---
title: "Ground Station Radio – LoRa Telemetry Link (Raspberry Pi 5 + SX1276)"
description: "LoRa radio for transmitting data between payload rocket and ground station 10,000 feet apart"
tech: ["RF", "Embedded C", "Python", "LoRa", "SPI"]
github: "https://github.com/..."
featured: true
importance: 1
---

## Overview

This project implements the wireless telemetry link between the rocket payload and the ground station using an SX1276 LoRa transceiver connected to a Raspberry Pi 5.

The system is responsible for:

- Configuring the SX1276 radio over SPI
- Transmitting structured binary telemetry frames
- Receiving and validating packets
- Providing RSSI and SNR diagnostics
- Interfacing with the STM32 on the ground station side

The visualization and telemetry decoding layer is documented separately in the <a href="/projects/ground-station-data-vis" target="_blank" rel="noopener noreferrer">ground station data visualization</a> project page.

---

## Hardware Architecture

### Payload Side
- Raspberry Pi 5
- SX1276 LoRa transceiver (SPI)
- GPIO control using `gpiod`

### Ground Station Side
- SX1276 LoRa receiver
- STM32 for UART forwarding
- Ground station computer for visualization (see <a href="/projects/ground-station-data-vis" target="_blank" rel="noopener noreferrer">ground station data visualization project</a>)

---

## LoRa Library

The radio driver is based on a Python SPI implementation called <a href="https://github.com/tapparelj/RaspberryPi-LoRaLib" target="_blank" rel="noopener noreferrer">RaspberryPi-LoRaLib</a>

The original library required significant modification to function on the Raspberry Pi 5 due to changes in the `gpiod` API.

---

## Modifications Made

### 1. Rewritten GPIO Handling (Pi 5 Compatibility)

The original implementation used an older `gpiod` interface.  
I rewrote all GPIO handling using the updated `gpiod.request_lines()` API.

These are the functions I modified:

```python
def input_gpio(gpio):
    """
    Read value from GPIO line.
    Returns 1=True/HIGH, 0=False/LOW
    """
    with gpiod.request_lines(
        "/dev/gpiochip4",
        consumer="loralibPi5",
        config={
            DIO0: gpiod.LineSettings(
                direction=Direction.INPUT, output_value=Value.INACTIVE
            ),
            RST: gpiod.LineSettings(
                direction=Direction.OUTPUT, output_value=Value.INACTIVE
            ),
            TX: gpiod.LineSettings(
                direction=Direction.OUTPUT, output_value=Value.INACTIVE
            )
        },
    ) as request:
        return request.get_value(gpio)


def output_gpio(gpio, value):
    """
    Set value of GPIO line.
    value: 0/1 or False/True
    """
    with gpiod.request_lines(
        "/dev/gpiochip4",
        consumer="loralibPi5",
        config={
            DIO0: gpiod.LineSettings(
                direction=Direction.INPUT, output_value=Value.INACTIVE
            ),
            RST: gpiod.LineSettings(
                direction=Direction.OUTPUT, output_value=Value.INACTIVE
            ),
            TX: gpiod.LineSettings(
                direction=Direction.OUTPUT, output_value=Value.INACTIVE
            )
        },
    ) as request:
        request.set_value(gpio, Value.ACTIVE if value else Value.INACTIVE)
```

This ensured compatibility with the Raspberry Pi 5 kernel and device tree.

---

### 2. SPI Auto-Detection Utility

I was having trouble detecting the LoRa module we were using, so I added a scanning function to detect which SPI bus the SX1276 is connected to.

```python
def scan_spi_for_sx1276(buses=(0,), devices=(0,1)):
    for bus in buses:
        for device in devices:
            spi.open(bus, device)
            resp = spi.xfer2([REG_VERSION & 0x7F, 0x00])
            version = resp[1]

            if version == 0x12:
                print(f"SX1276 detected on spidev{bus}.{device}")
```

The function checks the `REG_VERSION` register (expected value `0x12`) to confirm chipset presence.

This made debugging wiring and SPI configuration significantly easier.

---

### 3. Hardware Reset Routine

I also added a dedicated reset function:

```python
def sx1276_reset():
    output_gpio(RST, 0)
    time.sleep(0.15)
    output_gpio(RST, 1)
    time.sleep(0.15)
```

This ensures the transceiver boots into a known state before configuration, and makes it look cleaner for other people who are reading the code.

---

## Transmitting Code

### Radio Configuration

The radio is configured using the following parameters:

```python
fq = 915000000   # 915 MHz
bw = 125         # 125 kHz bandwidth
cr = 1           # 4/5 coding rate
implicitHeader = True
sf = 7           # Spreading factor
checkSum = False
syncWord = 0x12
power = 17       # Max output power
```

#### Key Parameters

- Frequency: 915 MHz ISM band
- Bandwidth: 125 kHz (balance between range and data rate)
- Spreading Factor: 7 (lower latency)
- Coding Rate: 4/5
- Sync Word: 0x12
- Transmit Power: 17 dBm

Many of these were just the default values that are recommended.

---

### Telemetry Frame Structure

Telemetry frames consist of 12 signed 16-bit integers (`int16_t`).

Python packing:

```python
def pack_frame(frame):
    return struct.pack('<' + 'h'*len(frame), *frame)
```

Example dummy frame:

```python
[1000, 360, 130, -100, 7500, 14000, 0, 0, 0, 0, 100, 0]
```

This produces a 24-byte binary payload, the same as what I discussed in my [ground station data visualization project](/ground-station-data-vis)

---

### Transmission

I used the recommended example transmission file already included in the library, and adjusted it to fit my needs (added configuration function and made it send dummy data for testing)

Like I said in my [ground station data visualization project](/ground-station-data-vis), as of 2/15/2026, we plan to have our first test launch on the 28th of February, so I'll have to wait a bit more before actually seeing how it fails once we use it on a real system. So here's my transmission code sending dummy data for now:

After initialization, this is what happens in the main loop:

```python
while 1:
        for i, frame in enumerate(dummy_frames):
            print(f"Sending dummy frame {i}")
            print(f"This is msg number {count}")
            packed = pack_frame(frame)
            loralib.transmit(packed)
            count += 1
            time.sleep(2.5)
```

This allowed me to:

- Verify correct SPI communication
- Validate byte order consistency
- Confirm STM32 unpacking
- Test visualization stability
- Measure RSSI and SNR consistency

---

## Future Improvements

- Add CRC validation at application layer
- Implement loss detection
- Add automatic retransmission
- Optimize spreading factor for range testing
- Integrate live flight sensor data

---

## Code 

### Transmission Code

```python
import loralibPi5 as loralib
import time
import struct

fq = 915000000 # 915 MHz
bw = 125 # 125 kHz
cr = 1 # 4/5 coding rate
implicitHeader = True # implicit header
sf = 7 # 7 spreading factor (default)
checkSum = False # FOR TESTING NOW NO CHECKSUM, EVENTUALLY MAYBE IT WILL HAVE ONE
syncWord = 0x12
power = 17 # max power

dummy_frames = [
      [1000,  360, 130, -100,  7500, 14000,   0,  0,   0,  0, 100, 0],
      [2000,  125, 135,  140,  7501, 14001,   5, -10, 10,  1, 90, 1],
      [4000,  130, 10,  160,  7600, 14200,  10, 200, 30,  1, 40, 2],
      [8000,  140, 100,  180,  7700, 14300,  15, 400, 50,  2, 20, 3],
      [12000, 135, 140,  170,  7800, 14400,   8, -100, 25,  2, 10, 4]
];

count = 0

def pack_frame(frame):
    return struct.pack('<' + 'h'*len(frame), *frame)

#############################################
# STM32 CODE TO UNPACK, WE ALREADY ARE UNPACKING IN DATA VIS THO
# int16_t values[12];

# for (int i = 0; i < 12; i++) {
#     values[i] = (int16_t)(data[2*i] | (data[2*i+1] << 8));
# }
#############################################

#############################################
if __name__ == "__main__":

    loralib.initialize()
    # configure with: 915 MHz frequency band, 125 kHz bandwidth, 
    # 4/5 coding rate (4/4+cr), no explicit header, spreading factor of 7, disabling CRC (adding a checksum),
    # sync word as 0x12, and outputting at max power
    loralib.configure(fq, bw, cr, implicitHeader, sf, checkSum, syncWord, power)
    while 1:
        for i, frame in enumerate(dummy_frames):
            print(f"Sending dummy frame {i}")
            print(f"This is msg number {count}")
            packed = pack_frame(frame)
            loralib.transmit(packed)
            count += 1
            time.sleep(2.5)
```

### Modified Library

```python
#############################################
#                                           #
#    Python library for LoRa SPI chips      #
#          TCL, EPFL, Switzerland           #
#             Joachim Tapparel              #
#                                           #
#############################################


################## Imports ##################
import spidev
import gpiod
import time

from gpiod.line import Direction, Value

################# Constants #################

# SX1276 - Raspberry connections
DIO0                      = 4
RST                       = 17
TX                       = 27

BUS                       = 0
DEVICE                    = 0

# Registers
REG_FIFO                  = 0x00
REG_OPMODE                = 0x01
REG_FRF_MSB               = 0x06  # FRF
REG_FRF_MID               = 0x07
REG_FRF_LSB               = 0x08
REG_PA_CONFIG             = 0x09
REG_PA_RAMP               = 0x0A
REG_LNA                   = 0x0C  # LOW NOISE AMPLIFIER
REG_FIFO_ADDR_PTR         = 0x0D
REG_FIFO_TX_BASE_AD       = 0x0E
REG_FIFO_RX_BASE_AD       = 0x0F
REG_FIFO_RX_CURRENT_ADDR  = 0x10
REG_IRQ_FLAGS_MASK        = 0x11
REG_IRQ_FLAGS             = 0x12
REG_RX_NB_BYTES           = 0x13
REG_MODEM_STAT            = 0x18
REG_PKT_SNR_VALUE         = 0x19
REG_PKT_RSSI              = 0x1A
REG_RSSI                  = 0x1B
REG_MODEM_CONFIG          = 0x1D
REG_MODEM_CONFIG2         = 0x1E
REG_SYMB_TIMEOUT_LSB  	  = 0x1F
REG_PAYLOAD_LENGTH        = 0x22
REG_MAX_PAYLOAD_LENGTH 	  = 0x23
REG_HOP_PERIOD            = 0x24
REG_MODEM_CONFIG3         = 0x26
REG_SYNC_WORD			  = 0x39
REG_DIO_MAPPING_1         = 0x40
REG_VERSION	  			  = 0x42
REG_PA_DAC                = 0x4D
# Operation mode
OPMODE_MASK               = 0xF8  # 11111000  use & to clear opmode bits
OPMODE_SLEEP              = 0x00  # Sleep
OPMODE_STANDBY            = 0x01  # Standby
OPMODE_TX                 = 0x03  # Transmit
OPMODE_RX                 = 0x05  # Receive continuous
OPMODE_LORA_HF            = 0x80  # LoRa mode at High Frequency + Sleep mode
# Bits masking the corresponding IRQs from the radio
IRQ_LORA_TXDONE_MASK      = 0x08
# DIO function mappings             D0D1D2D3
MAP_DIO0_LORA_TXDONE      = 0x40  # 01------
MAP_DIO1_LORA_NOP         = 0x30  # --11----
MAP_DIO2_LORA_NOP         = 0xC0  # ----11--
# MASKS
# ModemConfig1
BANDWIDTH_MASK            = 0x0F  # 00001111  use & to clear bandwidth bits
CR_MASK                   = 0xF1  # 11110001  use & to clear cr bits
HEADER_MASK               = 0xFE  # 11111110  ...
# ModemConfig2
SF_MASK                   = 0x0F  # 00001111
CONT_MODE_MASK            = 0xF7  # 11110111
CRC_MASK                  = 0xFB  # 11111011
SYMB_TIMEOUT_MASK         = 0xFC  # 11111100
# ModemConfig3
LOW_RATE_MASK             = 0xF7  # 11110111
AGC_MASK                  = 0xFB  # 11111011


SPEED                     = 500000  # Clock speed: between 500 000 and 32 000 000 Hz
OUTPUT                    = 1
INPUT                     = 0
HIGH                      = 1
LOW                       = 0
MAX_FRAME_LEN             = 255


spi = spidev.SpiDev()

def input_gpio(gpio):
    """
    Read value from GPIO line.
    Returns 1=True/HIGH, 0=False/LOW
    """
    with gpiod.request_lines(
        "/dev/gpiochip4",
        consumer="loralibPi5",
        config={
            DIO0: gpiod.LineSettings(
                direction=Direction.INPUT, output_value=Value.INACTIVE
            ),
            RST: gpiod.LineSettings(
                direction=Direction.OUTPUT, output_value=Value.INACTIVE
            ),
            TX: gpiod.LineSettings(
                direction=Direction.OUTPUT, output_value=Value.INACTIVE
            )
        },
    ) as request:
        return request.get_value(gpio)


def output_gpio(gpio, value):
    """
    Set value of GPIO line.
    value: 0/1 or False/True
    """
    with gpiod.request_lines(
        "/dev/gpiochip4",
        consumer="loralibPi5",
        config={
            DIO0: gpiod.LineSettings(
                direction=Direction.INPUT, output_value=Value.INACTIVE
            ),
            RST: gpiod.LineSettings(
                direction=Direction.OUTPUT, output_value=Value.INACTIVE
            ),
            TX: gpiod.LineSettings(
                direction=Direction.OUTPUT, output_value=Value.INACTIVE
            )
        },
    ) as request:
        request.set_value(gpio, Value.ACTIVE if value else Value.INACTIVE)


def writeReg(addr, value):
    # Write a value on a register
    # address MSB must be one to write
    spibuf = bytes([addr|0x80, value])
    spi.xfer(spibuf,SPEED,0,8)

def readReg(addr):
    # address MSB must be zero to read
    result = spi.xfer([addr & 0x7F, 0x00])
    return result[1]


def writeBuf(addr, value):
    # This function writes strings on the buffer
    # Input: string to send
    # Support for arrays or lists of numbers is not guaranteed
    # address MSB must be one to write
    # data = [addr|0x80]
    # for x in value:
    #     data.append(ord(x))
    # spibuf = bytes(data)
    # spi.xfer(spibuf,SPEED,0,8)
    
    # value must be bytes or bytearray
    data = bytes([addr | 0x80]) + value
    spi.xfer(data, SPEED, 0, 8)


def opmode(mode):
    # Set the operating mode of the chip
    writeReg(REG_OPMODE, (readReg(REG_OPMODE) & OPMODE_MASK) | mode)

def setLoRaMode():
    # Set HF Lora Mode
    writeReg(REG_OPMODE, OPMODE_LORA_HF)

############## Setup functions ##############
def initialize():

    bus = BUS
    device = DEVICE
    spi.open(bus, device)
    spi.max_speed_hz = 500000
    spi.mode = 0b00

    sx1276_reset()
    # Check chipset version
    version = readReg(REG_VERSION)
    if (version != 0x12):
        print(version, "Unrecognized transceiver.")
        exit()
    # Set operating mode to sleep mode in order to modify the registers
    opmode(OPMODE_SLEEP)
    # Enter LoRa mode
    setLoRaMode()

def setFrequency(frequency):
    # Set center frequency
    # Input: carrier frequency in Hz
    frf = (frequency << 19) // 32000000
    writeReg( REG_FRF_MSB, (frf & 0xFF0000) >> 16 )
    writeReg( REG_FRF_MID, (frf & 0x00FF00) >> 8  )
    writeReg( REG_FRF_LSB, (frf & 0x0000FF) )

def getFrequency():
    msb = readReg(REG_FRF_MSB)& 0xFF
    mid = readReg(REG_FRF_MID)& 0xFF
    lsb = readReg(REG_FRF_LSB)& 0xFF
    frf = ((msb<<16)& 0xFF0000) +((mid<<8) & 0x00FF00)+ (lsb & 0x0000FF)

    freq = 32000000*frf/(1<<19)
    return freq


def mapBandwidth(bandwidth):
    # Map the bandwidth to the bits to be written in the register
    # Input: bandwidth in kHz
    bandwidth_Hz = bandwidth*1000
    bandwidth_map = 8
    if   bandwidth_Hz == 7800:
        bandwidth_map = 0
    elif bandwidth_Hz == 10400:
        bandwidth_map = 1
    elif bandwidth_Hz == 15600:
        bandwidth_map = 2
    elif bandwidth_Hz == 20800:
        bandwidth_map = 3
    elif bandwidth_Hz == 31250:
        bandwidth_map = 4
    elif bandwidth_Hz == 41700:
        bandwidth_map = 5
    elif bandwidth_Hz == 62500:
        bandwidth_map = 6
    elif bandwidth_Hz == 125000:
        bandwidth_map = 7
    elif bandwidth_Hz == 250000:
        bandwidth_map = 8
    elif bandwidth_Hz == 500000:
        bandwidth_map = 9
    else:
        print("Wrong bandwidth: Setting 250 kHz.")
        bandwidth_map = 8
    return bandwidth_map

def setBandwidth(bandwidth):
    # Write the bandwidth into the respective register
    # Input: bandwidth in kHz
    bandwidth_map = mapBandwidth(bandwidth)
    modem_config = (readReg(REG_MODEM_CONFIG) & BANDWIDTH_MASK) | (bandwidth_map << 4)
    writeReg(REG_MODEM_CONFIG, modem_config)

def setCodingRate(coding_rate):
    # Write the coding rate into the respective register
    # Input: coding rate mapping (1: 4/5, to 4: 4/8)
    if (coding_rate < 1):
        print("Input coding rate out of range. Setting maximum value: 4/5.")
        coding_rate = 1
    elif (coding_rate > 4):
        print("Input coding rate out of range. Setting minimum value: 4/8.")
        coding_rate = 4
    modem_config = (readReg(REG_MODEM_CONFIG) & CR_MASK) | (coding_rate << 1)
    writeReg(REG_MODEM_CONFIG, modem_config)

def setHeader(implicit_header):
    # Write the header flag into the respective register:
    # implicit (input: 1), explicit (input: 0)
    if (implicit_header != 0) and (implicit_header != 1):
        print("Expected boolean value for implicit header flag. Setting explicit header : 0.")
        implicit_header = 0
    modem_config = (readReg(REG_MODEM_CONFIG) & HEADER_MASK) | implicit_header
    writeReg(REG_MODEM_CONFIG, modem_config)

def setSF(spreading_factor):
    # Write the spreading factor into the respective register
    # Input: spreading factor (7 to 12)
    if (spreading_factor < 7):
        print("Input spreading factor out of range. Setting minimum standard value: 7.")
        spreading_factor = 7
    elif (spreading_factor > 12):
        print("Input spreading factor out of range. Setting maximum value: 12.")
        spreading_factor = 12
    modem_config2 = (readReg(REG_MODEM_CONFIG2) & SF_MASK) | (spreading_factor << 4)
    writeReg(REG_MODEM_CONFIG2, modem_config2)

def setContMode(tx_continuous_mode):
    # Write the continuous tx mode flag into the respective register:
    # on (input: 1), off (input: 0)
    if (tx_continuous_mode != 0) and (tx_continuous_mode != 1):
        print("Expected boolean value for tx mode flag. Disabling continuous mode: 0.")
        tx_continuous_mode = 0
    modem_config2 = (readReg(REG_MODEM_CONFIG2) & CONT_MODE_MASK) | (tx_continuous_mode << 3)
    writeReg(REG_MODEM_CONFIG2, modem_config2)

def setCRC(crc):
    # Write the cyclic redundancy check flag into the respective register:
    # on (input: 1), off (input: 0)
    if (crc != 0) and (crc != 1):
        print("Expected boolean value for CRC flag. Enabling CRC: 1.")
        crc = 1
    modem_config2 = (readReg(REG_MODEM_CONFIG2) & CRC_MASK) | (crc << 2)
    writeReg(REG_MODEM_CONFIG2, modem_config2)

def setSymbolTimeout(symbol_timeout):
    # Get the total symbol timeout and divide the number into LSB and MSB.
    # Write the two parts of the symbol timeout into the respective registers.
    # Maximum input is 1023 symbols since we have 10 bits in total:
    # - 2 LSB from REG_MODEM_CONFIG2 are the 2 MSB of symbol_timeout
    # - the 8 bits of REG_SYMB_TIMEOUT_LSB are the 8 LSB of symbol_timeout
    if (symbol_timeout < 1):
        print("Input symbol timeout out of range. Setting minimum value: 1.")
        symbol_timeout = 1
    elif (symbol_timeout > 1023):
        print("Input symbol timeout out of range. Setting maximum value: 1023.")
        symbol_timeout = 1023
    LSB_mask = 255 # 0011111111
    MSB_mask = 768 # 1100000000
    symbol_timeout_LSB = symbol_timeout & LSB_mask
    symbol_timeout_MSB = (symbol_timeout & MSB_mask) >> 8
    modem_config2 = (readReg(REG_MODEM_CONFIG2) & SYMB_TIMEOUT_MASK) | symbol_timeout_MSB
    writeReg(REG_MODEM_CONFIG2, modem_config2)
    writeReg(REG_SYMB_TIMEOUT_LSB, symbol_timeout_LSB)

def optimizeLowRate(spreading_factor, bandwidth):
    # Write the low rate optimization flag into the respective register.
    # Optimization is mandated for symbol durations higher than 16 ms:
    # Spreading factor and Bandwidth (in kHz) are needed.
    # Remark: you need to pass the bandwidth in kHz, not the mapping
    symbol_time = pow(2.0, spreading_factor) / bandwidth # ms
    low_rate_optimized = 0          # 0  -> Non-optimized Low data rate
    if (symbol_time > 16):
        low_rate_optimized = 1      # 1  -> Optimized Low data rate
    modem_config3 = (readReg(REG_MODEM_CONFIG3) & LOW_RATE_MASK) | (low_rate_optimized << 3)
    writeReg(REG_MODEM_CONFIG3, modem_config3)

def setSyncWord(sync_word):
    # Set sync word. You might use the LoRaWAN public sync word
    if (sync_word < 0):
        print("Input sync word out of range. Setting LoRa value: 0x12.")
        sync_word = 0x12
    elif (sync_word > 255):
        print("Input sync word out of range. Setting LoRa value: 0x12.")
        sync_word = 0x12
    writeReg(REG_SYNC_WORD, sync_word)

def setPayloadLength(payload_length):
    # Set payload length in bytes
    if (payload_length < 1):
        print("Input payload lengths smaller than one not allowed. Setting to 1.")
        payload_length = 1
    elif (payload_length > 255):
        print("Input payload length out of range. Setting maximum value: 255.")
        payload_length = 255
    writeReg(REG_PAYLOAD_LENGTH, payload_length)

def setMaxPayloadLength(max_payload_length):
    # Set maximum payload length in bytes if header payload length exceeds this value,
    # a header CRC error is generated. Allows filtering of packets with a bad size.
    if (max_payload_length < 1):
        print("Max payload lengths smaller than one not allowed. Setting to default: 255.")
        max_payload_length = 255
    elif (max_payload_length > 255):
        print("Input max payload length out of range. Setting maximum value: 255.")
        max_payload_length = 255
    writeReg(REG_MAX_PAYLOAD_LENGTH, max_payload_length)

def setLNA(LNA_gain, LNA_boost_HF, LNA_AGC):
    # LNA configuration: only for receiver
    # Write LNA parameters into the respective registers:
    # - LNA gain from 1 (maximum) to 6 (minimum)
    # - Current booster for high frequency (3) or no boost (0)
    # - AGC flag: gain set by AGC (1) or not (0)
    if (LNA_gain < 1):
        print("Input LNA gain out of range. Setting maximum value: 1.")
        LNA_gain = 1
    elif (LNA_gain > 6):
        print("Input LNA gain out of range. Setting minimum value: 6.")
        LNA_gain = 6
    if (LNA_boost_HF != 0) and (LNA_boost_HF != 3):
        if (LNA_boost_HF != 1):
            print("Expected boolean value for LNA boost (false:0 or true:1/3). Setting default: 0.")
            LNA_boost_HF = 0
        else:
            LNA_boost_HF = 3
    if (LNA_AGC != 0) and (LNA_AGC != 1):
        print("Expected boolean value for LNA AGC flag. Disabling AGC: 0.")
        LNA_AGC = 0
    modem_config3 = (readReg(REG_MODEM_CONFIG3) & AGC_MASK) | (LNA_AGC << 2)
    writeReg(REG_MODEM_CONFIG3, modem_config3)
    # amplifier gain cannot be modified in sleep mode
    opmode(OPMODE_STANDBY)
    LNA_value = (LNA_gain << 5) | LNA_boost_HF
    writeReg(REG_LNA, LNA_value)

def setPaRamp(ramp_up_time):
    # Set PA ramp-up time: only for transmitter
    # Input: mapping from 0 to 15
    if (ramp_up_time < 0) or (ramp_up_time > 15):
        print("Input ramp up time out of range. Setting default value: 40 us.")
        ramp_up_time = 9
    writeReg(REG_PA_RAMP, (readReg(REG_PA_RAMP) & 0xF0) | ramp_up_time)

def configPower(output_power):
    if (output_power > 17):
        output_power = 17
    elif (output_power < 2):
        output_power = 2
    # register accepts a value up to 15 and then the chipset 
    # performs the operation to set the wanted power
    out = output_power - 2
    MaxPow = 7
    writeReg(REG_PA_CONFIG, (0x80|MaxPow<<4|out))
    writeReg(REG_PA_DAC, 0x84)

def transmit(frame):
    # Enter standby mode (required for FIFO loading))
    opmode(OPMODE_STANDBY)
    # Set the IRQ mapping DIO0=TxDone DIO1=NOP DIO2=NOP
    writeReg(REG_DIO_MAPPING_1, MAP_DIO0_LORA_TXDONE|MAP_DIO1_LORA_NOP|MAP_DIO2_LORA_NOP)
    # Clear all radio IRQ flags
    writeReg(REG_IRQ_FLAGS, 0xFF)
    # Mask all IRQs but TxDone
    writeReg(REG_IRQ_FLAGS_MASK, (~IRQ_LORA_TXDONE_MASK)&255)
    # Initialize the payload size and address pointers
    writeReg(REG_FIFO_TX_BASE_AD, 0x00)
    writeReg(REG_FIFO_ADDR_PTR, 0x00)
    if (len(frame) > MAX_FRAME_LEN):
        frame = frame[0:MAX_FRAME_LEN]
    setPayloadLength(len(frame))
    # Download buffer to the radio FIFO
    writeBuf(REG_FIFO, frame)
    # Start the transmission
    print("Payload:", frame)
    # PROBABLY HAVE TO UNCOMMENT THE NEXT LINE FOR THE WEIRD MODULE THING
    # output_gpio(TX,1)
    opmode(OPMODE_TX)
    # End the transmission

def packet_received():
    payload = ""
    receivedbytes = 0
    packet_flag = False
    irqflags = readReg(REG_IRQ_FLAGS)
    # Clear rxDone
    writeReg(REG_IRQ_FLAGS, 0x40)
    # Read irqflags
    if (irqflags and 0x10):
        print("Explicit header")
    else:
        print("Implicit header")
    if (readReg(REG_IRQ_FLAGS) & 0x40):
        print("CRC: on")
    else:
        print("CRC: off")
    print("Coding rate:", (readReg(REG_MODEM_STAT)&0xE0)>>5)
    print("Payload length:", readReg(REG_RX_NB_BYTES))
    #  payload crc: 0x20
    if ((irqflags & 0x20) == 0x20):
        print("CRC error")
        writeReg(REG_IRQ_FLAGS, 0x20)
        return packet_flag, payload, receivedbytes
    else:
        currentAddr = readReg(REG_FIFO_RX_CURRENT_ADDR)
        receivedbytes = readReg(REG_RX_NB_BYTES)
        writeReg(REG_FIFO_ADDR_PTR, currentAddr)
        for x in range(receivedbytes):
            payload = payload + chr(readReg(REG_FIFO))
        packet_flag = True
        return packet_flag, payload, receivedbytes

def receive():
    opmode(OPMODE_RX)
    SNR = 0
    rssicorr = 157
    while(1):
        if(input_gpio(DIO0) == 1):
            packet_flag, rx_message, receivedbytes = packet_received()
            if(packet_flag):
                # Received a message
                value = readReg(REG_PKT_SNR_VALUE)
                if (value & 0x80):
                    # The SNR sign bit is 1
                    # Invert and divide by 4
                    value = ( ( ~value + 1 ) & 0xFF ) >> 2
                    SNR = -value
                else:
                    # Divide by 4
                    SNR = ( value & 0xFF ) >> 2
                print("Packet RSSI:", (readReg(REG_PKT_RSSI)-rssicorr))
                print("RSSI:", readReg(REG_RSSI)-rssicorr)
                print("SNR:", SNR)
                print("Payload length:", receivedbytes)
                print("Message: ")
                print(rx_message)
        time.sleep(1)

def scan_spi_for_sx1276(
    buses=(0,),
    devices=(0, 1),
    speed=SPEED
):
    found = []

    for bus in buses:
        for device in devices:
            spi = spidev.SpiDev()
            try:
                spi.open(bus, device)
                spi.max_speed_hz = speed
                spi.mode = 0b00

                # Read REG_VERSION
                resp = spi.xfer2([REG_VERSION & 0x7F, 0x00])
                version = resp[1]

                spi.close()

                if version == 0x12:
                    print(f"SX1276 detected on spidev{bus}.{device}")
                    found.append((bus, device))
                else:
                    print(f"spidev{bus}.{device} responded with 0x{version:02X}")

            except FileNotFoundError:
                print(f"spidev{bus}.{device} does not exist")

            except PermissionError:
                print(f"Permission denied opening spidev{bus}.{device}")

            except Exception as e:
                print(f"Error on spidev{bus}.{device}: {e}")

    return found

def sx1276_reset():
    output_gpio(RST,0)
    time.sleep(0.15)
    output_gpio(RST,1)
    time.sleep(0.15)

def configure(fq, bw, cr, header, sf, CRC, sync, power):
        setFrequency(fq) # 915 MHz
        setBandwidth(bw)
        setCodingRate(cr)   # coding rate = 4/(4+cr)
        setHeader(header)    # False=>explicit header, True=>implicit header
        setSF(sf)
        setCRC(CRC)
        setSyncWord(sync)
        configPower(power)

# if __name__ == "__main__":
#     sx1276_reset()
#     devices = scan_spi_for_sx1276()

#     if devices:
#         print("Found SX1276 on:")
#         for bus, dev in devices:
#             print(f"   - spidev{bus}.{dev}")
#     else:
#         print("No SX1276 devices detected on SPI")
```