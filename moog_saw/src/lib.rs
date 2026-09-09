#![no_std]
extern crate alloc;

const TWO_PI: f64 = 2.0 * core::f64::consts::PI;

pub struct MoogSaw {
    phase: f64,
    sample_rate: f64,
    frequency_hz: f32,
    previous_sync: f32,
}

fn wrap_phase(phase: f64) -> f64 {
    let mut phase = phase - libm::floor(phase);
    if phase >= 1.0 {
        phase = 0.0;
    } else if phase < 0.0 {
        phase += 1.0;
    }
    phase
}

fn phase_increment(frequency_hz: f32, sample_rate: f64) -> f64 {
    if !frequency_hz.is_finite() || frequency_hz <= 0.0 || !sample_rate.is_finite() || sample_rate <= 0.0 {
        return 0.0;
    }
    frequency_hz as f64 / sample_rate
}

pub fn p(frequency_hz: f32) -> f32 {
    if !frequency_hz.is_finite() {
        return 0.9924f32;
    }

    let mut p = 0.9924f32 - 0.00002151f32 * frequency_hz;
    if p < 0.0 {
        p = 0.0;
    }
    if p > 1.0 {
        p = 1.0;
    }
    p
}

pub fn waveform(phase: f64, mut p: f32) -> f32 {
    let phase = wrap_phase(phase);

    if p <= 0.0 {
        p = 1.0e-7;
    } else if p >= 1.0 {
        p = 1.0 - 1.0e-7;
    }

    let pd_amplitude = core::f64::consts::PI - TWO_PI * p as f64;
    let phi_mod = if phase < p as f64 {
        pd_amplitude * phase / p as f64
    } else {
        pd_amplitude * (1.0 - phase) / (1.0 - p as f64)
    };

    -(libm::cos(TWO_PI * phase + phi_mod)) as f32
}

impl MoogSaw {
    pub fn new(sample_rate: f64) -> Option<Self> {
        if !sample_rate.is_finite() || sample_rate <= 0.0 {
            return None;
        }
        Some(MoogSaw {
            phase: 0.0,
            sample_rate,
            frequency_hz: 440.0,
            previous_sync: 0.0,
        })
    }

    pub fn reset(&mut self, phase: f64) {
        self.phase = wrap_phase(phase);
        self.previous_sync = 0.0;
    }

    pub fn set_frequency(&mut self, frequency_hz: f32) {
        self.frequency_hz = frequency_hz;
    }

    pub fn phase(&self) -> f64 {
        self.phase
    }

    pub fn process(&mut self, frequency: Option<&[f32]>, sync: Option<&[f32]>, output: &mut [f32]) {
        for i in 0..output.len() {
            let f = match frequency {
                Some(freq) => freq[i],
                None => self.frequency_hz,
            };
            let inc = phase_increment(f, self.sample_rate);

            if let Some(s) = sync {
                let current_sync = s[i];

                if self.previous_sync <= 0.0 && current_sync > 0.0 {
                    let delta = current_sync as f64 - self.previous_sync as f64;
                    let mut u = if delta != 0.0 {
                        -(self.previous_sync as f64) / delta
                    } else {
                        0.0
                    };
                    if u < 0.0 {
                        u = 0.0;
                    }
                    if u > 1.0 {
                        u = 1.0;
                    }

                    let samples_after_sync = 1.0 - u;
                    self.phase = wrap_phase(samples_after_sync * inc);
                }

                self.previous_sync = current_sync;
            }

            output[i] = waveform(self.phase, p(f));
            self.phase = wrap_phase(self.phase + inc);
        }
    }

    pub fn process_sample(&mut self, frequency_hz: f32, sync_event: bool, mut event_offset_samples: f64) -> f32 {
        let inc = phase_increment(frequency_hz, self.sample_rate);

        if sync_event {
            if !event_offset_samples.is_finite() {
                event_offset_samples = 0.0;
            }
            if event_offset_samples < 0.0 {
                event_offset_samples = 0.0;
            }
            if event_offset_samples > 1.0 {
                event_offset_samples = 1.0;
            }

            let samples_after_sync = 1.0 - event_offset_samples;
            self.phase = wrap_phase(samples_after_sync * inc);
        }

        let out = waveform(self.phase, p(frequency_hz));
        self.phase = wrap_phase(self.phase + inc);
        out
    }
}

pub mod ffi;
