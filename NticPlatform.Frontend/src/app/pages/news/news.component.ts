import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContentService, ChampionshipStory, NewsFeedItem } from '../../services/content.service';

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './news.component.html',
  styleUrl: './news.component.scss'
})
export class NewsComponent implements OnInit {
  activeTag = 'all';
  tags = ['all', 'robotics', 'coding', 'cyber', 'ai', 'innovation'];

  constructor(
    public contentService: ContentService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {}

  get currentUserEmail(): string {
    const u = localStorage.getItem('activeUserEmail');
    if (u && u.trim()) return u.trim().toLowerCase();
    let guestId = localStorage.getItem('ntic_guest_device_id');
    if (!guestId) {
      guestId = 'guest_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('ntic_guest_device_id', guestId);
    }
    return guestId;
  }

  trackByStory(index: number, story: ChampionshipStory): string {
    return story.id;
  }

  isLikedByUser(story: ChampionshipStory): boolean {
    return !!(story.likedBy && story.likedBy.includes(this.currentUserEmail));
  }

  likeStory(storyId: string, event?: MouseEvent): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.contentService.toggleLikeStory(storyId, this.currentUserEmail);
    this.cdr.detectChanges();
  }

  async shareStory(story: ChampionshipStory, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();
    const url = `${window.location.origin}/#/news?story=${story.id}`;
    const shareData = {
      title: story.title,
      text: story.body,
      url: url,
    };
    
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {}
    }
    
    try {
      await navigator.clipboard.writeText(`${story.title}\n${story.body}\n\n${url}`);
      const buttons = document.querySelectorAll<HTMLButtonElement>(`[data-share="${story.id}"]`);
      buttons.forEach(btn => {
        const orig = btn.innerHTML;
        btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">check</span>';
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
      });
    } catch {}
  }

  get filteredStories(): ChampionshipStory[] {
    if (this.activeTag === 'all') return this.contentService.championshipStories;
    return this.contentService.championshipStories.filter(s => s.tagColor === this.activeTag);
  }

  get latestNews(): NewsFeedItem[] {
    return this.contentService.newsFeedItems.slice(0, 12);
  }

  filterByTag(tag: string): void {
    this.activeTag = tag;
  }

  getTagLabel(tag: string): string {
    const labels: Record<string, string> = {
      all: 'All Stories', robotics: 'Robotics', coding: 'Coding',
      cyber: 'Cybersecurity', ai: 'Artificial Intelligence', innovation: 'Innovation'
    };
    return labels[tag] || tag;
  }

  getTagIcon(tag: string): string {
    const icons: Record<string, string> = {
      all: 'apps', robotics: 'precision_manufacturing', coding: 'code',
      cyber: 'shield', ai: 'smart_toy', innovation: 'lightbulb'
    };
    return icons[tag] || 'article';
  }
}
