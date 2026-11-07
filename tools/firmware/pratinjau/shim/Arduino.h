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
