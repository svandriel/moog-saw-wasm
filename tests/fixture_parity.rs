mod wav;

use moog_saw::MoogSaw;
use std::path::Path;

use crate::wav::write_float32_wav;

const FREQUENCIES: [f32; 7] = [55.0, 110.0, 220.0, 440.0, 880.0, 1760.0, 3520.0];

const WRITE_FIXTURES_ARG: &str = "--write-fixtures";
const SAMPLE_RATE: u32 = 48000;
const SAMPLE_COUNT: usize = 12000;

#[test]
fn matches_golden_fixtures_bit_exact() {
    // Collect all command-line arguments passed into a vector
    let args: Vec<String> = std::env::args().collect();

    let should_write_fixtures = args.iter().any(|item| item == WRITE_FIXTURES_ARG);
    if (should_write_fixtures) {
        println!("[UPDATING WAV FIXTURES]");
    }

    for f in FREQUENCIES {
        let fixture_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
        let path = fixture_path.join(format!("moog_saw_{f}Hz.wav"));

        let mut osc = MoogSaw::new(SAMPLE_RATE as f64).unwrap();
        osc.set_frequency(f);
        let mut out = vec![0.0f32; SAMPLE_COUNT];
        osc.process(None, None, &mut out);

        if (should_write_fixtures) {
            write_float32_wav(&path, SAMPLE_RATE, &out).unwrap();
        } else {
            let (sample_rate, expected) = wav::read_float32_wav(&path);

            assert_eq!(sample_rate, SAMPLE_RATE);
            assert_eq!(expected.len(), SAMPLE_COUNT);
            let mismatches = out
                .iter()
                .zip(expected.iter())
                .filter(|(a, b)| a.to_bits() != b.to_bits())
                .count();
            assert_eq!(
                mismatches,
                0,
                "{f} Hz: {mismatches}/{expected_len} samples differ, use --write-fixtures to update",
                expected_len = expected.len()
            );
        }
    }
}
