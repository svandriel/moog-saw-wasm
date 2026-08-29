use std::fs;
use std::path::Path;

pub fn read_float32_wav(path: &Path) -> (u32, Vec<f32>) {
    let data = fs::read(path).unwrap();
    assert_eq!(&data[0..4], b"RIFF", "RIFF magic");
    assert_eq!(&data[8..12], b"WAVE", "WAVE magic");

    assert_eq!(&data[12..16], b"fmt ", "fmt chunk");
    let audio_format = u16::from_le_bytes([data[20], data[21]]);
    assert_eq!(audio_format, 3, "must be IEEE float");
    let channels = u16::from_le_bytes([data[22], data[23]]);
    assert_eq!(channels, 1, "must be mono");
    let sample_rate = u32::from_le_bytes([data[24], data[25], data[26], data[27]]);
    let bits_per_sample = u16::from_le_bytes([data[34], data[35]]);
    assert_eq!(bits_per_sample, 32, "must be 32-bit float");

    assert_eq!(&data[36..40], b"data", "data chunk");
    let data_size = u32::from_le_bytes([data[40], data[41], data[42], data[43]]) as usize;
    let mut samples = Vec::with_capacity(data_size / 4);
    for chunk in data[44..44 + data_size].chunks_exact(4) {
        samples.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
    }
    (sample_rate, samples)
}
