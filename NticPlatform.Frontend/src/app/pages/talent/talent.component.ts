import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContentService } from '../../services/content.service';

@Component({
  selector: 'app-talent',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './talent.component.html',
  styleUrl: './talent.component.scss'
})
export class TalentComponent {
  constructor(public contentService: ContentService) {}
}
