import { getAuthValue } from '../../services/session.util';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { ContentService, ChampionshipStory, NewsFeedItem, UpcomingEvent } from '../../services/content.service';
import { PublicNavComponent } from '../../components/public-nav/public-nav.component';
import { SocialShareComponent } from '../../components/social-share/social-share.component';

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [CommonModule, RouterLink, PublicNavComponent, SocialShareComponent],
  templateUrl: './news.component.html',
  styleUrl: './news.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsComponent implements OnInit, OnDestroy {
  activeTag = 'all';
  tags = ['all', 'robotics', 'coding', 'cyber', 'ai', 'innovation'];
  activeShareStoryId: string | null = null;
  activeShareEventId: string | null = null;
  highlightedStoryId: string | null = null;
  readingStory: ChampionshipStory | null = null;
  readingProgress = 0;
  private liveTimer: any;

  constructor(
    public contentService: ContentService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.liveTimer = setInterval(() => this.cdr.detectChanges(), 30_000);

    // Deep link query or route param handler for shared links
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.highlightedStoryId = params['id'];
        this.checkAndOpenStory(params['id']);
        this.scrollToTarget(params['id']);
      }
    });
    this.route.queryParams.subscribe(query => {
      if (query['story']) {
        this.highlightedStoryId = query['story'];
        this.checkAndOpenStory(query['story']);
        this.scrollToTarget(query['story']);
      } else if (this.readingStory && !this.route.snapshot.params['id']) {
        // Handle browser hardware back button navigation seamlessly
        this.readingStory = null;
        this.readingProgress = 0;
        if (typeof document !== 'undefined') {
          document.body.style.overflow = '';
        }
        this.cdr.markForCheck();
      }
    });

    this.cdr.markForCheck();
  }

  private checkAndOpenStory(id: string): void {
    const found = this.contentService.championshipStories.find(s => s.id === id);
    if (found) {
      this.readingStory = found;
      this.readingProgress = 0;
      if (typeof document !== 'undefined') {
        document.body.style.overflow = 'hidden';
      }
      this.cdr.markForCheck();
    }
  }

  openStoryModal(story: ChampionshipStory, event?: MouseEvent): void {
    event?.stopPropagation();
    this.readingStory = story;
    this.readingProgress = 0;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { story: story.id },
      queryParamsHandling: 'merge'
    });
    this.cdr.markForCheck();
  }

  onModalScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    this.readingProgress = maxScroll > 0 ? Math.min(100, Math.max(0, Math.round((el.scrollTop / maxScroll) * 100))) : 0;
    this.cdr.markForCheck();
  }

  closeStoryModal(): void {
    this.readingStory = null;
    this.readingProgress = 0;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
    if (this.route.snapshot.params['id']) {
      this.router.navigate(['/news'], {
        queryParams: { story: null },
        queryParamsHandling: 'merge'
      });
    } else {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { story: null },
        queryParamsHandling: 'merge'
      });
    }
    this.cdr.markForCheck();
  }

  @HostListener('document:keydown.escape')
  onEscapePress(): void {
    if (this.readingStory) {
      this.closeStoryModal();
    }
  }

  getStoryParagraphs(body: string): string[] {
    if (!body) return [];
    return body.split(/\n\s*\n|\n/).map(p => p.trim()).filter(p => p.length > 0);
  }

  getStoryReadTime(story: ChampionshipStory): string {
    if (story.readTime) return story.readTime;
    const words = (story.body || '').split(/\s+/).length;
    const mins = Math.max(1, Math.round(words / 160));
    return `${mins} min read`;
  }

  private scrollToTarget(id: string): void {
    setTimeout(() => {
      const el = document.getElementById('story-' + id) || document.getElementById('event-' + id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      this.cdr.detectChanges();
    }, 300);
  }

  toggleStoryShare(storyId: string, event?: MouseEvent): void {
    event?.stopPropagation();
    this.activeShareStoryId = this.activeShareStoryId === storyId ? null : storyId;
    this.cdr.markForCheck();
  }

  toggleEventShare(eventId: string, event?: MouseEvent): void {
    event?.stopPropagation();
    this.activeShareEventId = this.activeShareEventId === eventId ? null : eventId;
    this.cdr.markForCheck();
  }

  getStoryCanonicalUrl(storyId: string): string {
    return `/news/${storyId}`;
  }

  getEventCanonicalUrl(eventId: string): string {
    return `/events/${eventId}`;
  }

  ngOnDestroy(): void {
    if (this.liveTimer) clearInterval(this.liveTimer);
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
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
        const orig = btn.textContent;
        btn.textContent = '\u2713';
        setTimeout(() => { btn.textContent = orig; }, 2000);
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
