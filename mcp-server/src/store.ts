export interface TaggedElement {
  index: number;
  selector: string;
  innerText: string;
  outerHTML: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  pageURL: string;
  timestamp: string;
  screenshot?: string; // base64 data URI, optional
}

type ClearListener = () => void;

class TagStore {
  private tags: Map<string, TaggedElement[]> = new Map();
  private clearListeners: Set<ClearListener> = new Set();

  setTags(pageURL: string, elements: TaggedElement[]): void {
    if (elements.length === 0) {
      this.tags.delete(pageURL);
    } else {
      this.tags.set(pageURL, elements);
    }
  }

  getAllTags(): TaggedElement[] {
    const all: TaggedElement[] = [];
    for (const elements of this.tags.values()) {
      all.push(...elements);
    }
    return all;
  }

  getTagsByURL(pageURL: string): TaggedElement[] {
    return this.tags.get(pageURL) ?? [];
  }

  getTagCount(): number {
    let count = 0;
    for (const elements of this.tags.values()) {
      count += elements.length;
    }
    return count;
  }

  getPageURLs(): string[] {
    return Array.from(this.tags.keys());
  }

  clear(): void {
    this.tags.clear();
    for (const listener of this.clearListeners) {
      listener();
    }
  }

  onClear(listener: ClearListener): () => void {
    this.clearListeners.add(listener);
    return () => this.clearListeners.delete(listener);
  }
}

export const store = new TagStore();
