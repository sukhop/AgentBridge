import path from 'node:path';
import { compressImage } from '../utils/image.js';

export class ScreenshotController {
  constructor({ adapter, config, logger }) {
    this.adapter = adapter;
    this.config = config;
    this.logger = logger;
  }

  async capture(session) {
    try {
      const rawPath = await this.adapter.captureWindow(session);
      const outputPath = path.join(this.config.screenshotPath, `agremote-${session.projectName}-${Date.now()}.jpg`);
      return await compressImage(rawPath, outputPath);
    } catch (error) {
      this.logger.error('Screenshot failed', { stack: error.stack });
      throw error;
    }
  }
}
