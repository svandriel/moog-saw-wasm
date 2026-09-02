mod wav;

use libm::log2f;
use moog_saw::MoogSaw;
use std::path::{Path, PathBuf};

use crate::wav::write_float32_wav;

const FREQUENCIES: [f32; 7] = [55.0, 110.0, 220.0, 440.0, 880.0, 1760.0, 3520.0];

const WRITE_FIXTURES_ARG: &str = "--write-fixtures";
const SAMPLE_RATE: u32 = 48000;
const SAMPLE_COUNT: usize = 12000;

#[test]
fn matches_golden_fixtures_bit_exact() {
    for f in FREQUENCIES {
        let fixture_path = get_fixture_path();
        let path = fixture_path.join(format!("moog_saw_{f}Hz.wav"));

        let mut osc = MoogSaw::new(SAMPLE_RATE as f64).unwrap();
        osc.set_frequency(f);
        let mut out = vec![0.0f32; SAMPLE_COUNT];
        osc.process(None, None, &mut out);

        assert_or_write(&out, SAMPLE_RATE, &path);
    }
}

#[test]
fn match_freq_sweep() {
    let freq_min = 20.0f32;
    let freq_max = 10000.0f32;
    let freq: [f32; SAMPLE_COUNT] = freq_sweep_log(freq_min, freq_max);

    assert_eq!(SAMPLE_COUNT, freq.len());

    let fixture_path = get_fixture_path();
    let path = fixture_path.join("freq_sweep.wav");

    let mut osc = MoogSaw::new(SAMPLE_RATE as f64).unwrap();
    osc.set_frequency(220.0f32);
    let mut out = vec![0.0f32; SAMPLE_COUNT];
    osc.process(Some(&freq), None, &mut out);

    assert_or_write(&out, SAMPLE_RATE, &path);
}

fn freq_sweep_log<const N: usize>(freq_min: f32, freq_max: f32) -> [f32; N] {
    let freq_min_log = log2f(freq_min);
    let freq_max_log = log2f(freq_max);
    let freq_incr_log = (freq_max_log - freq_min_log) / (N - 1) as f32;

    let mut samples = [0.0; N];

    for i in 0..N {
        let freq_log = freq_min_log + (i as f32) * freq_incr_log;
        samples[i] = freq_log.exp2();
    }

    samples
}

fn cli_should_write_fixtures() -> bool {
    let args: Vec<String> = std::env::args().collect();
    return args.iter().any(|item| item == WRITE_FIXTURES_ARG);
}

fn get_fixture_path() -> PathBuf {
    return Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
}

fn assert_or_write(actual: &Vec<f32>, actual_sample_rate: u32, path: &Path) {
    if cli_should_write_fixtures() {
        println!("-> Writing {}", path.display());
        write_float32_wav(&path, SAMPLE_RATE, &actual).unwrap();
    } else {
        // Load fixture and compare to the actual waveform
        let (expected_sample_rate, expected) = wav::read_float32_wav(&path);
        assert_eq!(expected_sample_rate, actual_sample_rate);
        assert_eq!(expected.len(), SAMPLE_COUNT);
        let mismatches = actual
            .iter()
            .zip(expected.iter())
            .filter(|(a, b)| a.to_bits() != b.to_bits())
            .count();
        assert_eq!(
            mismatches,
            0,
            "{}: {}/{} samples differ, use --write-fixtures to update",
            path.display(),
            mismatches,
            expected.len()
        );
    }
}
