---
title: "STM LED Stand"
description: "First custom PCB project using Altium! Also learning about DRAM, PWM, LED drivers, and STM32CubeIDE"
tech: ["STM32", "Embedded C", "Altium", "PCB Design", "PWM"]
github: "https://github.com/..."
featured: true
importance: 2
---

## Overview

This project involved designing and building a custom LED stand using an STM32 microcontroller. The goals were to learn about:

- DRAM interfacing
- Pulse Width Modulation (PWM) for Neopixel RGB LEDs
- LED driver integration
- STM32CubeIDE workflow
- PCB design using Altium

This was mostly just a learning project using Phil's Lab's <a href="https://www.youtube.com/watch?v=gFmm91c_mr8&list=PL3aaAq2OJU5HcbClqrOhqBDozF7HmxV-s" target="_blank" rel="noopener noreferrer"> Microcontroller-Based Hardware Design With Altium Designer Tutorial Playlist</a>, but I customized it to a project that I wanted to practice part selection and routing on my own.

---

## Design & Hardware

### Project Outline:

I used hierarchical schematic sheets for easy organization of each component, such as for power, LEDs, and the microcontroller itself. Other than the logic shifter, and LEDs, all components were picked following the tutorial.

### Schematic
Schematic image goes here

#### Considerations & Things I Learned
- Most parts have lots of calculations done out for you, and also example schematics

### PCB Layout
Layout image goes here

#### Considerations & Things I Learned
- Buck converter layout and routing is very strict, and their datasheet usually provides the best layout
- Differential pair routing & how they work
- EMI for crystal oscillators and keeping them away from high speed signals
- JTAG and SWD programming

### Components
- STM32 microcontroller 
- LEDs
- Logic Shifter
- Buck Converter
- Crystal Oscillator
- USB C Adapter

---

## Software & Firmware

I used this tutorial to learn how to use PWM to drive the Neopixel LEDs

---

## Final Product

To be continued! Winter quarter is really busy, and I haven't had the time to solder and debug the real thing.

---

## Future Improvements

Need to add

---

## Code

### My STM Code

### Modified Library

