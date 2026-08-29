CC      := gcc
EMCC    := emcc

CFLAGS  := -std=c11 -O2 -Wall -Wextra -Wpedantic
LDFLAGS := -lm

INCLUDE := -Iinclude

SRC     := src/moog_saw.c
WASM_SRC := $(SRC) src/moog_saw_wasm.c
TEST_SRC := tests/test_moog_saw.c
WAV_TEST_SRC := tests/generate_wav.c

BUILD   := build
NATIVE  := $(BUILD)/native
WASM    := $(BUILD)/wasm
WAV     := $(BUILD)/wav

.PHONY: all native test wav wasm clean

all: native wasm

native: $(NATIVE)/test_moog_saw

$(NATIVE)/test_moog_saw: $(SRC) $(TEST_SRC) include/moog_saw.h
	@mkdir -p $(NATIVE)
	$(CC) $(CFLAGS) $(INCLUDE) $(SRC) $(TEST_SRC) $(LDFLAGS) -o $@

test: $(NATIVE)/test_moog_saw
	$(NATIVE)/test_moog_saw

$(WAV)/generate_wav: $(SRC) $(WAV_TEST_SRC) include/moog_saw.h
	@mkdir -p $(WAV)
	$(CC) $(CFLAGS) $(INCLUDE) $(SRC) $(WAV_TEST_SRC) $(LDFLAGS) -o $@

wav: $(WAV)/generate_wav
	$(WAV)/generate_wav

wasm: $(WASM)/moog_saw.js

$(WASM)/moog_saw.js: $(WASM_SRC) include/moog_saw.h
	@mkdir -p $(WASM)
	$(EMCC) \
		-O3 \
		-std=c11 \
		$(INCLUDE) \
		$(WASM_SRC) \
		-sMODULARIZE=1 \
		-sEXPORT_ES6=1 \
		-sEXPORTED_FUNCTIONS='["_moog_saw_wasm_create","_moog_saw_wasm_destroy","_moog_saw_wasm_reset","_moog_saw_wasm_set_frequency","_moog_saw_wasm_process","_malloc","_free"]' \
		-sEXPORTED_RUNTIME_METHODS='["HEAPF32"]' \
		-o $@

clean:
	rm -rf $(BUILD)
