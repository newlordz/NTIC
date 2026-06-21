import { Component } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';

@Component({ selector: 'app-competitions', standalone: true, imports: [CommonModule, TitleCasePipe],
  templateUrl: './competitions.component.html', styleUrl: './competitions.component.scss' })
export class CompetitionsComponent {
  competitions = [
    { title: 'National Coding Challenge 2026', track: 'coding', icon: 'code', category: 'Algorithms & Problem Solving', teams: 48, deadline: 'Jun 28, 2026', prize: '₵ 5,000', status: 'active', progress: 72 },
    { title: 'Robotics Grand Prix', track: 'robotics', icon: 'smart_toy', category: 'Line Following & Obstacle Avoidance', teams: 32, deadline: 'Jul 5, 2026', prize: '₵ 8,000', status: 'active', progress: 45 },
    { title: 'AI & Machine Learning Bowl', track: 'ai', icon: 'model_training', category: 'ML Models & Chatbots', teams: 24, deadline: 'Jul 12, 2026', prize: '₵ 6,000', status: 'registration', progress: 20 },
    { title: 'Cybersecurity CTF Championship', track: 'cyber', icon: 'security', category: 'CTF & Security Simulations', teams: 36, deadline: 'Jun 30, 2026', prize: '₵ 4,000', status: 'active', progress: 88 },
    { title: 'Innovation Challenge — AgriTech', track: 'innovation', icon: 'agriculture', category: 'Agriculture & Food Security', teams: 28, deadline: 'Jul 20, 2026', prize: '₵ 7,000', status: 'registration', progress: 15 },
    { title: 'Web Dev Hackathon', track: 'coding', icon: 'web', category: 'Software Development', teams: 40, deadline: 'Jul 8, 2026', prize: '₵ 3,500', status: 'active', progress: 60 },
  ];
}
