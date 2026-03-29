import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Generic config hash manager for detecting configuration changes between restarts.
 * Used by both local and cloud device managers to track device config modifications.
 */
export class ConfigHash {
  private hashDir: string;

  constructor(persistPath: string, subdirectory = 'tuya-configs') {
    this.hashDir = path.join(persistPath, subdirectory);
    // Ensure directory exists
    if (!fs.existsSync(this.hashDir)) {
      fs.mkdirSync(this.hashDir, { recursive: true });
    }
  }

  /**
   * Compute a hash of any configuration object.
   * Converts object to sorted JSON string and returns SHA256 hash.
   */
  private computeHash(configObject: any): string {
    const json = JSON.stringify(configObject, Object.keys(configObject).sort());
    return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
  }

  /**
   * Get the stored hash for an item, if any.
   */
  private getStoredHash(itemId: string): string | null {
    try {
      const hashFile = path.join(this.hashDir, `${itemId}.hash`);
      if (fs.existsSync(hashFile)) {
        return fs.readFileSync(hashFile, 'utf-8').trim();
      }
    } catch {
      // Silently fail if hash file can't be read
    }
    return null;
  }

  /**
   * Save the hash for an item.
   */
  private saveHash(itemId: string, hash: string): void {
    try {
      const hashFile = path.join(this.hashDir, `${itemId}.hash`);
      fs.writeFileSync(hashFile, hash, 'utf-8');
    } catch {
      // Silently fail if hash can't be saved
    }
  }

  /**
   * Check if configuration has changed since last run.
   * Returns { changed: boolean, newHash: string }
   */
  hasConfigChanged(itemId: string, configObject: any): { changed: boolean; newHash: string } {
    const newHash = this.computeHash(configObject);
    const oldHash = this.getStoredHash(itemId);

    // If no old hash, it's a new item (not a change in existing config)
    if (!oldHash) {
      this.saveHash(itemId, newHash);
      return { changed: false, newHash };
    }

    // If hashes differ, config changed
    if (oldHash !== newHash) {
      this.saveHash(itemId, newHash);
      return { changed: true, newHash };
    }

    // Hash matches, no change
    return { changed: false, newHash };
  }
}
