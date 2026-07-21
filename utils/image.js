import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export async function compressImage(inputPath, outputPath = inputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(inputPath)
    .rotate()
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(outputPath);
  return outputPath;
}

export async function cropImage(inputPath, outputPath, crop) {
  if (!crop) return compressImage(inputPath, outputPath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(inputPath)
    .extract(crop)
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(outputPath);
  return outputPath;
}
