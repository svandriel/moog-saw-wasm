use std::fs;
use std::fs::File;
use std::io::{Result, Write};
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

pub fn write_float32_wav(path: &Path, sample_rate: u32, samples: &[f32]) -> Result<()> {
    let mut file = File::create(&path)?;

    let channels: u16 = 1;
    let audio_format: u16 = 3; // IEEE 754 float
    let bits_per_sample: u16 = 32;
    let bytes_per_sample: u16 = bits_per_sample / 8; // float is 4 bytes
    let block_align: u16 = channels * bytes_per_sample;
    let byte_rate: u32 = sample_rate * block_align as u32;
    let fmt_chunk_size: u32 = 16;
    let data_chunk_size = samples.len() as u32 * block_align as u32;
    let riff_size: u32 = 4 + (8 + fmt_chunk_size) + (8 + data_chunk_size);

    // RIFF header
    file.write_all(b"RIFF")?;
    file.write_all(&riff_size.to_le_bytes())?;

    // WAVE chunk
    file.write_all(b"WAVE")?;

    // fmt chunk
    file.write_all(b"fmt ")?;
    file.write_all(&fmt_chunk_size.to_le_bytes())?;
    file.write_all(&audio_format.to_le_bytes())?;
    file.write_all(&channels.to_le_bytes())?;
    file.write_all(&sample_rate.to_le_bytes())?;
    file.write_all(&byte_rate.to_le_bytes())?;
    file.write_all(&block_align.to_le_bytes())?;
    file.write_all(&bits_per_sample.to_le_bytes())?;

    // data chunk
    file.write_all(b"data")?;
    file.write_all(&data_chunk_size.to_le_bytes())?;

    for &sample in samples {
        file.write_all(&sample.to_le_bytes())?;
    }

    Ok(())
}
