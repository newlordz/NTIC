import { getAuthValue } from '../../services/session.util';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContentService, ChampionshipStory, NewsFeedItem, UpcomingEvent } from '../../services/content.service';

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './news.component.html',
  styleUrl: './news.component.scss'
})
export class NewsComponent implements OnInit, OnDestroy {
  activeTag = 'all';
  tags = ['all', 'robotics', 'coding', 'cyber', 'ai', 'innovation'];
  private liveTimer: any;

  constructor(
    public contentService: ContentService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.liveTimer = setInterval(() => this.cdr.detectChanges(), 30_000);
  }

  ngOnDestroy(): void {
    if (this.liveTimer) clearInterval(this.liveTimer);
  }

  timeAgo(date: string): string {
    const parsed = Date.parse(date);
    if (!parsed) return '';
    const diff = Date.now() - parsed;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + ' min ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + ' hr ago';
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + ' days ago';
    const months = Math.floor(days / 30);
    return months + ' months ago';
  }

  get currentUserEmail(): string {
    const u = getAuthValue('activeUserEmail');
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

  get upcomingEvents(): UpcomingEvent[] {
    return this.contentService.upcomingEvents;
  }

  filterByTag(tag: string): void {
    this.activeTag = tag;
  }

  getTagLabel(tag: string): string {
    const labels: Record<string, string> = {
      all: 'All Stories', robotics: 'Robotics', coding: 'Coding',
      cyber: 'Networking & Cybersecurity', ai: 'Artificial Intelligence', innovation: 'Innovation'
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
