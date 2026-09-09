use alloc::boxed::Box;
use core::ptr;

use crate::{MoogSaw, p, waveform};

#[unsafe(no_mangle)]
pub unsafe extern "C" fn moog_saw_create(sample_rate: f64) -> *mut MoogSaw {
    match MoogSaw::new(sample_rate) {
        Some(osc) => Box::into_raw(Box::new(osc)),
        None => ptr::null_mut(),
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn moog_saw_destroy(osc: *mut MoogSaw) {
    if !osc.is_null() {
        drop(unsafe { Box::from_raw(osc) });
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn moog_saw_reset(osc: *mut MoogSaw, phase: f64) {
    if let Some(osc) = unsafe { osc.as_mut() } {
        osc.reset(phase);
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn moog_saw_set_frequency(osc: *mut MoogSaw, frequency_hz: f32) {
    if let Some(osc) = unsafe { osc.as_mut() } {
        osc.set_frequency(frequency_hz);
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn moog_saw_phase(osc: *const MoogSaw) -> f64 {
    if let Some(osc) = unsafe { osc.as_ref() } {
        osc.phase()
    } else {
        0.0
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn moog_saw_p(frequency_hz: f32) -> f32 {
    p(frequency_hz)
}

#[unsafe(no_mangle)]
pub extern "C" fn moog_saw_waveform(phase: f64, p: f32) -> f32 {
    waveform(phase, p)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn moog_saw_process(
    osc: *mut MoogSaw,
    frequency: *const f32,
    sync: *const f32,
    output: *mut f32,
    frames: u32,
) {
    if osc.is_null() || output.is_null() || frames == 0 {
        return;
    }
    let out = unsafe { core::slice::from_raw_parts_mut(output, frames as usize) };
    let freq = if frequency.is_null() {
        None
    } else {
        Some(unsafe { core::slice::from_raw_parts(frequency, frames as usize) })
    };
    let sync = if sync.is_null() {
        None
    } else {
        Some(unsafe { core::slice::from_raw_parts(sync, frames as usize) })
    };
    unsafe { (*osc).process(freq, sync, out) };
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn moog_saw_process_sample(
    osc: *mut MoogSaw,
    frequency_hz: f32,
    sync_event: i32,
    event_offset_samples: f64,
    output: *mut f32,
) {
    if osc.is_null() || output.is_null() {
        return;
    }
    unsafe { *output = (*osc).process_sample(frequency_hz, sync_event != 0, event_offset_samples) };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ffi_create_process_then_destroy() {
        let osc = unsafe { moog_saw_create(48000.0) };
        assert!(!osc.is_null());

        unsafe {
            moog_saw_reset(osc, 0.0);
            moog_saw_set_frequency(osc, 480.0);
            let mut out = [0.0f32; 4];
            moog_saw_process(osc, ptr::null(), ptr::null(), out.as_mut_ptr(), 4);
            assert!(out.iter().all(|s| s.is_finite()));

            let phase = moog_saw_phase(osc);
            assert!((phase - 4.0 * 480.0 / 48000.0).abs() < 1e-12);

            let mut sample = 0.0f32;
            moog_saw_process_sample(osc, 480.0, 1, 0.25, &mut sample);
            assert!(sample.is_finite());

            moog_saw_destroy(osc);
        }
    }
}