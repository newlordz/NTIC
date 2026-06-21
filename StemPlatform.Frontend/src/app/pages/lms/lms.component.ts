import { Component } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';

@Component({ selector: 'app-lms', standalone: true, imports: [CommonModule, TitleCasePipe],
  templateUrl: './lms.component.html', styleUrl: './lms.component.scss' })
export class LmsComponent {
  activeTab = 'courses';
  courses = [
    { title: 'Python Data Structures', track: 'coding', icon: 'data_object', level: 'Intermediate', enrolled: 320, completion: 68, modules: 8, status: 'active' },
    { title: 'Arduino Robotics Base', track: 'robotics', icon: 'memory', level: 'Beginner', enrolled: 180, completion: 42, modules: 6, status: 'active' },
    { title: 'Intro to Neural Networks', track: 'ai', icon: 'model_training', level: 'Advanced', enrolled: 85, completion: 0, modules: 7, status: 'planning' },
    { title: 'Ethical Hacking 101', track: 'cyber', icon: 'security', level: 'Intermediate', enrolled: 140, completion: 22, modules: 5, status: 'active' },
    { title: 'Design Thinking Sprint', track: 'innovation', icon: 'tips_and_updates', level: 'Beginner', enrolled: 210, completion: 55, modules: 4, status: 'active' },
    { title: 'Web Dev Bootcamp', track: 'coding', icon: 'code', level: 'Beginner', enrolled: 290, completion: 61, modules: 10, status: 'active' },
    { title: 'Computer Vision Basics', track: 'ai', icon: 'visibility', level: 'Advanced', enrolled: 60, completion: 33, modules: 6, status: 'active' },
    { title: 'Sensor Integration Lab', track: 'robotics', icon: 'sensors', level: 'Intermediate', enrolled: 95, completion: 50, modules: 5, status: 'active' },
    { title: 'Digital Safety & CTF', track: 'cyber', icon: 'shield', level: 'Beginner', enrolled: 175, completion: 80, modules: 4, status: 'active' },
  ];
  
  submissions = [
    { student: 'Kwame Asante', school: 'Achimota', assignment: 'Dijkstra\'s Implementation', track: 'coding', file: 'pathfinder_v2.py', score: null, status: 'pending', time: '10m ago' },
    { student: 'Abena Mensah', school: 'Wesley Girls', assignment: 'Line Follower Demo', track: 'robotics', file: 'demo_run.mp4', score: null, status: 'pending', time: '1h ago' },
    { student: 'Team Alpha', school: 'PRESEC', assignment: 'Physics Engine Core', track: 'coding', file: 'src_final_v3.zip', score: 62, status: 'resubmission', time: '2h ago' },
    { student: 'Kofi Boateng', school: 'Prempeh', assignment: 'SQL Injection Demo', track: 'cyber', file: 'writeup.pdf', score: 88, status: 'approved', time: '3h ago' },
    { student: 'Ama Darko', school: 'Holy Child', assignment: 'AgriBot Prototype', track: 'robotics', file: 'bot_demo.mp4', score: null, status: 'pending', time: '4h ago' },
  ];
}
