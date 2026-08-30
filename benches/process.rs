use std::hint::black_box;

use criterion::{BenchmarkId, Criterion, Throughput, criterion_group, criterion_main};
use moog_saw::MoogSaw;

const SAMPLE_RATE: f64 = 48_000.0;
const BLOCK: usize = 1024;
const SYNC_PERIOD: usize = 128;
const FREQS: [f32; 7] = [55.0, 110.0, 220.0, 440.0, 880.0, 1760.0, 3520.0];

fn bench_process_freq(c: &mut Criterion) {
    let mut group = c.benchmark_group("process");
    group.throughput(Throughput::Elements(BLOCK as u64));

    for &f in &FREQS {
        let freq = vec![f; BLOCK];
        let mut out = vec![0.0f32; BLOCK];
        let mut osc = MoogSaw::new(SAMPLE_RATE).unwrap();

        group.bench_function(BenchmarkId::new("audio_rate_freq", f), |b| {
            b.iter(|| {
                osc.process(black_box(Some(&freq[..])), None, black_box(&mut out[..]));
            });
        });
    }
    group.finish();
}

fn bench_process_freq_sync(c: &mut Criterion) {
    let mut group = c.benchmark_group("process");
    group.throughput(Throughput::Elements(BLOCK as u64));

    for &f in &FREQS {
        let freq = vec![f; BLOCK];
        let sync: Vec<f32> = (0..BLOCK)
            .map(|i| if (i / SYNC_PERIOD).is_multiple_of(2) { -1.0 } else { 1.0 })
            .collect();
        let mut out = vec![0.0f32; BLOCK];
        let mut osc = MoogSaw::new(SAMPLE_RATE).unwrap();

        group.bench_function(BenchmarkId::new("audio_rate_freq_sync", f), |b| {
            b.iter(|| {
                osc.process(
                    black_box(Some(&freq[..])),
                    Some(black_box(&sync[..])),
                    black_box(&mut out[..]),
                );
            });
        });
    }
    group.finish();
}

criterion_group!(benches, bench_process_freq, bench_process_freq_sync);
criterion_main!(benches);