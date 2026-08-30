mod wav;

use moog_saw::MoogSaw;
use std::path::Path;

use crate::wav::write_float32_wav;

const FREQUENCIES: [f32; 7] = [55.0, 110.0, 220.0, 440.0, 880.0, 1760.0, 3520.0];

#[test]
fn matches_golden_fixtures_bit_exact() {
    for f in FREQUENCIES {
        let fixture_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
        let path = fixture_path.join(format!("moog_saw_{f}Hz.wav"));
        let write_path = fixture_path.join(format!("moog_saw_{f}Hz_new.wav"));
        let (sample_rate, expected) = wav::read_float32_wav(&path);
        assert_eq!(sample_rate, 48000);
        write_float32_wav(&write_path, sample_rate, &expected).unwrap();

        let mut osc = MoogSaw::new(sample_rate as f64).unwrap();
        osc.set_frequency(f);
        let mut out = vec![0.0f32; expected.len()];
        osc.process(None, None, &mut out);

        let mismatches = out
            .iter()
            .zip(expected.iter())
            .filter(|(a, b)| a.to_bits() != b.to_bits())
            .count();
        assert_eq!(
            mismatches,
            0,
            "{f} Hz: {mismatches}/{expected_len} samples differ",
            expected_len = expected.len()
        );
    }
}
