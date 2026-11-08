import fs from 'fs';
import path from 'path';
import { dataFile } from '../../config/paths.ts';

export interface LocalSocialPost {
  id: number;
  workspaceId: number;
  title: string;
  caption: string;
  contentType: 'IMAGE' | 'TEXT' | 'CAROUSEL' | 'REEL' | 'STORY';
  objective: string;
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED' | 'PROCESSING';
  scheduledAt?: string | null;
  publishedAt?: string | null;
  productId?: string | null;
  cta?: string | null;
  targetPlatforms: string[];
  mediaAssets?: Array<{
    id: number;
    url: string;
    mediaType: string;
  }>;
  externalPostId?: string | null;
  externalPostUrl?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutoPilotSettings {
  enabled: boolean;
  frequencyHours: number; // e.g. every 12 or 24 hours
  lastPublishedAt?: string | null;
  totalAutoPublished: number;
  targetPlatform: 'FACEBOOK';
  tone: string;
}

const STORAGE_PATH = dataFile('local-social-posts.json');
const SETTINGS_PATH = dataFile('autopilot-settings.json');

export class SocialFallbackStorage {
  static loadPosts(): LocalSocialPost[] {
    try {
      if (fs.existsSync(STORAGE_PATH)) {
        const raw = fs.readFileSync(STORAGE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('[SocialFallbackStorage] Failed to read local-social-posts.json:', e);
    }
    return [];
  }

  static savePosts(posts: LocalSocialPost[]): void {
    try {
      const dir = path.dirname(STORAGE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STORAGE_PATH, JSON.stringify(posts, null, 2), 'utf-8');
    } catch (e) {
      console.error('[SocialFallbackStorage] Error saving local-social-posts.json:', e);
    }
  }

  static addPost(post: Omit<LocalSocialPost, 'id' | 'createdAt' | 'updatedAt'>): LocalSocialPost {
    const posts = this.loadPosts();
    const nextId = posts.length > 0 ? Math.max(...posts.map((p) => p.id)) + 1 : 1;
    const now = new Date().toISOString();
    const newPost: LocalSocialPost = {
      ...post,
      id: nextId,
      createdAt: now,
      updatedAt: now,
    };
    posts.unshift(newPost);
    this.savePosts(posts);
    return newPost;
  }

  static updatePost(id: number, updates: Partial<LocalSocialPost>): LocalSocialPost | null {
    const posts = this.loadPosts();
    const index = posts.findIndex((p) => p.id === id);
    if (index === -1) return null;
    posts[index] = {
      ...posts[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.savePosts(posts);
    return posts[index];
  }

  static deletePost(id: number): boolean {
    const posts = this.loadPosts();
    const filtered = posts.filter((p) => p.id !== id);
    if (filtered.length === posts.length) return false;
    this.savePosts(filtered);
    return true;
  }

  static getDuePosts(): LocalSocialPost[] {
    const posts = this.loadPosts();
    const now = new Date();
    return posts.filter(
      (p) =>
        p.status === 'SCHEDULED' &&
        p.scheduledAt &&
        new Date(p.scheduledAt) <= now
    );
  }

  static getAutoPilotSettings(): AutoPilotSettings {
    try {
      if (fs.existsSync(SETTINGS_PATH)) {
        const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[SocialFallbackStorage] Could not load autopilot settings:', e);
    }
    return {
      enabled: true,
      frequencyHours: 24,
      totalAutoPublished: 0,
      targetPlatform: 'FACEBOOK',
      tone: 'persuasivo_comercial',
    };
  }

  static saveAutoPilotSettings(settings: AutoPilotSettings): void {
    try {
      const dir = path.dirname(SETTINGS_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (e) {
      console.error('[SocialFallbackStorage] Error saving autopilot settings:', e);
    }
  }
}
