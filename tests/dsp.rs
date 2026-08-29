use moog_saw::{MoogSaw, p, waveform};

#[test]
fn parameter_fit() {
    let expected = 0.9924f32 - 0.00002151f32 * 440.0f32;
    assert!((p(440.0) - expected).abs() < 1e-6);
}

#[test]
fn progression() {
    let mut osc = MoogSaw::new(48000.0).unwrap();
    osc.set_frequency(480.0);

    let mut out = [0.0f32; 4];
    osc.process(None, None, &mut out);

    for s in out.iter() {
        assert!(s.is_finite());
    }

    let expected_phase = 4.0 * 480.0 / 48000.0;
    assert!((osc.phase() - expected_phase).abs() < 1e-12);
}

#[test]
fn fractional_sync() {
    let mut osc = MoogSaw::new(48000.0).unwrap();
    osc.reset(0.37);

    let sync = [-1.0f32, 1.0f32];
    let freq = [480.0f32, 480.0f32];
    let mut out = [0.0f32; 2];

    osc.process(Some(&freq), Some(&sync), &mut out);

    let expected_phase = 1.5 * 480.0 / 48000.0;
    assert!((osc.phase() - expected_phase).abs() < 1e-12);
}

#[test]
fn explicit_event() {
    let mut osc = MoogSaw::new(48000.0).unwrap();

    let out = osc.process_sample(480.0, true, 0.25);

    let expected_phase = 1.75 * 480.0 / 48000.0;
    assert!((osc.phase() - expected_phase).abs() < 1e-12);
    assert!(out.is_finite());
}