import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({ selector: 'app-talent', standalone: true, imports: [CommonModule],
  templateUrl: './talent.component.html', styleUrl: './talent.component.scss' })
export class TalentComponent {
  categories = [
    { title: 'Top Coder', icon: 'code', color: 'primary', name: 'Kwame Asante', school: 'PRESEC Legon', grade: '12', score: 99.8, track: 'coding', perks: ['Certificate', 'Cash Prize', 'Internship'] },
    { title: 'Top Female Coder', icon: 'code', color: 'primary', name: 'Abena Mensah', school: 'Wesley Girls SHS', grade: '11', score: 97.2, track: 'coding', perks: ['Certificate', 'Scholarship', 'Mentorship'] },
    { title: 'Top Robotics Engineer', icon: 'smart_toy', color: 'tertiary', name: 'Marcus Kwaku', school: 'Achimota SHS', grade: '12', score: 98.5, track: 'robotics', perks: ['Certificate', 'Cash Prize'] },
    { title: 'Top AI Developer', icon: 'model_training', color: 'secondary', name: 'Kofi Amponsah', school: 'PRESEC Legon', grade: '11', score: 96.8, track: 'ai', perks: ['Certificate', 'Internship', 'Mentorship'] },
    { title: 'Top Cybersecurity Talent', icon: 'security', color: 'error', name: 'Yaw Darko', school: 'Prempeh College', grade: '12', score: 95.4, track: 'cyber', perks: ['Certificate', 'Cash Prize'] },
    { title: 'Top Female Innovator', icon: 'tips_and_updates', color: 'innovation', name: 'Ama Owusu', school: 'Holy Child SHS', grade: '10', score: 94.1, track: 'innovation', perks: ['Certificate', 'Scholarship', 'Cash Prize', 'Mentorship'] },
    { title: 'Top Male Coder', icon: 'code', color: 'primary', name: 'Ekow Asante', school: 'Mfantsipim School', grade: '12', score: 99.1, track: 'coding', perks: ['Certificate', 'Internship'] },
    { title: 'Overall Talent', icon: 'stars', color: 'primary', name: 'Kwame Asante', school: 'PRESEC Legon', grade: '12', score: 99.8, track: 'coding', perks: ['Certificate', 'Cash Prize', 'Scholarship', 'Internship', 'Mentorship'] },
  ];
}
