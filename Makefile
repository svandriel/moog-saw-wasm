CC      := gcc
EMCC    := emcc

CFLAGS  := -std=c11 -O2 -Wall -Wextra -Wpedantic
LDFLAGS := -lm

INCLUDE := -Iinclude

DSP_SRC  := src/moog_saw.c src/polyblep.c
WASM_SRC := $(DSP_SRC) src/moog_saw_wasm.c
TEST_SRC := tests/test_moog_saw.c
BLEP_TEST_SRC := tests/test_polyblep.c

BUILD   := build
NATIVE  := $(BUILD)/native
WASM    := $(BUILD)/wasm

.PHONY: all native test test-moog-saw test-polyblep wasm clean

all: native wasm

native: $(NATIVE)/test_moog_saw $(NATIVE)/test_polyblep

$(NATIVE)/test_moog_saw: $(DSP_SRC) $(TEST_SRC) include/moog_saw.h include/polyblep.h
	@mkdir -p $(NATIVE)
	$(CC) $(CFLAGS) $(INCLUDE) $(DSP_SRC) $(TEST_SRC) $(LDFLAGS) -o $@

$(NATIVE)/test_polyblep: src/polyblep.c $(BLEP_TEST_SRC) include/polyblep.h
	@mkdir -p $(NATIVE)
	$(CC) $(CFLAGS) $(INCLUDE) src/polyblep.c $(BLEP_TEST_SRC) $(LDFLAGS) -o $@

test: test-moog-saw test-polyblep

test-moog-saw: $(NATIVE)/test_moog_saw
	$(NATIVE)/test_moog_saw

test-polyblep: $(NATIVE)/test_polyblep
	$(NATIVE)/test_polyblep

wasm: $(WASM)/moog_saw.js

$(WASM)/moog_saw.js: $(WASM_SRC) include/moog_saw.h include/polyblep.h
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
