import { Component } from '@angular/core';
import { CommonModule, TitleCasePipe, DecimalPipe } from '@angular/common';

@Component({ selector: 'app-leaderboard', standalone: true, imports: [CommonModule, TitleCasePipe, DecimalPipe],
  templateUrl: './leaderboard.component.html', styleUrl: './leaderboard.component.scss' })
export class LeaderboardComponent {
  podium = [
    { rank: 2, school: 'Newton Academy', pts: '12,450', initials: 'NA' },
    { rank: 1, school: 'Apex Tech High', pts: '14,200', initials: 'AT' },
    { rank: 3, school: 'Curie Institute', pts: '11,800', initials: 'CI' },
  ];
  standings = [
    { rank: 4, school: 'Tesla Magnet School', region: 'Greater Accra', attendance: '98%', avg: 92.4, pts: 11240, trend: 'up' },
    { rank: 5, school: 'Pioneer STEM Academy', region: 'Ashanti', attendance: '95%', avg: 88.7, pts: 10950, trend: 'up' },
    { rank: 6, school: 'Da Vinci Charter', region: 'Eastern', attendance: '82%', avg: 94.1, pts: 10810, trend: 'down' },
    { rank: 7, school: 'Achimota SHS', region: 'Greater Accra', attendance: '96%', avg: 85.3, pts: 10620, trend: 'up' },
    { rank: 8, school: 'Wesley Girls SHS', region: 'Central', attendance: '99%', avg: 87.9, pts: 10480, trend: 'up' },
    { rank: 9, school: 'PRESEC Legon', region: 'Greater Accra', attendance: '91%', avg: 83.2, pts: 10310, trend: 'same' },
    { rank: 10, school: 'Prempeh College', region: 'Ashanti', attendance: '88%', avg: 90.5, pts: 10150, trend: 'down' },
  ];
}
