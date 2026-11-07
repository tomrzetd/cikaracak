// Tiruan minimal Arduino.h agar Adafruit_GFX + wajah.cpp bisa dikompilasi di komputer (hanya untuk pratinjau).
#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdlib.h>
#include <math.h>
#include <string>
#include <algorithm>
#define PROGMEM
#define F(s) (reinterpret_cast<const __FlashStringHelper *>(s))
class __FlashStringHelper;
typedef bool boolean;
#ifndef PI
#define PI 3.1415926535897932384626433832795
#endif
#define DEG_TO_RAD 0.017453292519943295769236907684886
#define RAD_TO_DEG 57.295779513082320876798154814105
#define radians(deg) ((deg) * DEG_TO_RAD)
#define degrees(rad) ((rad) * RAD_TO_DEG)
typedef uint8_t byte;
class String {
 public:
  String(const char *s = "") : s_(s ? s : "") {}
  const char *c_str() const { return s_.c_str(); }
  unsigned int length() const { return (unsigned)s_.size(); }
 private:
  std::string s_;
};
#include "Print.h"
