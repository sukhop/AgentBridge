import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export class PluginLoader {
  constructor({ logger }) {
    this.logger = logger;
    this.adapters = new Map();     // name -> Adapter class
    this.messengers = new Map();   // name -> Messenger class
  }

  async loadPlugins(pluginsDir) {
    const adaptersDir = path.join(pluginsDir, 'adapters');
    const messengersDir = path.join(pluginsDir, 'messengers');

    await this.scanAndLoad(adaptersDir, this.adapters, 'adapter');
    await this.scanAndLoad(messengersDir, this.messengers, 'messenger');
  }

  async scanAndLoad(dir, registry, type) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.js')) {
          const name = path.basename(entry.name, '.js');
          const fullPath = path.join(dir, entry.name);
          await this.loadPluginFile(fullPath, name, registry, type);
        } else if (entry.isDirectory()) {
          const indexPath = path.join(dir, entry.name, 'index.js');
          const namePath = path.join(dir, entry.name, `${entry.name}.js`);
          let targetPath = null;
          try {
            await fs.access(indexPath);
            targetPath = indexPath;
          } catch {
            try {
              await fs.access(namePath);
              targetPath = namePath;
            } catch {
              // No valid entry point found
            }
          }
          if (targetPath) {
            await this.loadPluginFile(targetPath, entry.name, registry, type);
          }
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger.error(`Error loading plugins of type ${type} from ${dir}`, { error: error.message });
      }
    }
  }

  async loadPluginFile(filePath, name, registry, type) {
    try {
      const fileUrl = pathToFileURL(filePath).href;
      const module = await import(fileUrl);
      const ExportedClass = module.default || module[Object.keys(module)[0]];
      if (ExportedClass) {
        registry.set(name.toLowerCase(), ExportedClass);
        this.logger.info(`Loaded ${type} plugin`, { name: name.toLowerCase(), path: filePath });
      } else {
        this.logger.warn(`No valid class exported from plugin file`, { path: filePath });
      }
    } catch (error) {
      this.logger.error(`Failed to import plugin ${name}`, { path: filePath, error: error.message });
    }
  }
}
