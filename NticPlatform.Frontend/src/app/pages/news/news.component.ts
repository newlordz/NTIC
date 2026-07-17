import { Component, OnInit } from '@angular/core';
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

  constructor(public contentService: ContentService) {}

  ngOnInit(): void {}

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
