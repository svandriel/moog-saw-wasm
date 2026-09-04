use std::hint::black_box;

use criterion::{BenchmarkId, Criterion, Throughput, criterion_group, criterion_main};
use moog_saw::{MoogSaw, p, waveform};

const SAMPLE_RATE: f64 = 48_000.0;
const PHASES: usize = 1024;
const FREQS: [f32; 7] = [55.0, 110.0, 220.0, 440.0, 880.0, 1760.0, 3520.0];

fn bench_p(c: &mut Criterion) {
    let mut group = c.benchmark_group("primitives");
    group.throughput(Throughput::Elements(1));

    for &f in &FREQS {
        group.bench_function(BenchmarkId::new("p", f), |b| {
            b.iter(|| {
                black_box(p(black_box(f)));
            });
        });
    }
    group.finish();
}

fn bench_waveform(c: &mut Criterion) {
    let mut group = c.benchmark_group("primitives");
    group.throughput(Throughput::Elements(PHASES as u64));

    let phases: Vec<f64> = (0..PHASES).map(|i| i as f64 / PHASES as f64).collect();

    for &f in &FREQS {
        let p_f = p(f);
        group.bench_function(BenchmarkId::new("waveform", f), |b| {
            b.iter(|| {
                let mut acc = 0.0f32;
                for &ph in black_box(&phases) {
                    acc = waveform(ph, p_f);
                }
                black_box(acc);
            });
        });
    }
    group.finish();
}

fn bench_process_sample(c: &mut Criterion) {
    let mut group = c.benchmark_group("primitives");
    group.throughput(Throughput::Elements(1));

    for &f in &FREQS {
        let mut osc = MoogSaw::new(SAMPLE_RATE).unwrap();
        group.bench_function(BenchmarkId::new("process_sample", f), |b| {
            b.iter(|| {
                black_box(osc.process_sample(f, false, 0.0));
            });
        });
    }
    group.finish();
}

criterion_group!(benches, bench_p, bench_waveform, bench_process_sample);
criterion_main!(benches);
