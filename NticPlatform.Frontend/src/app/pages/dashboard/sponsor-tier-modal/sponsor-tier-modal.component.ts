import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Sponsorship tier drill-down modal.
 *
 * Extracted from the dashboard's monolithic template to keep the compiled
 * template under the Angular compiler's control-flow-analysis size limit
 * (the NG3 error). It owns its own search state and CSV export, and reports
 * only "close" back up to the parent.
 */
@Component({
  selector: 'app-sponsor-tier-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sponsor-tier-modal.component.html',
  styleUrl: './sponsor-tier-modal.component.scss',
})
export class SponsorTierModalComponent implements OnInit {
  @Input() tier: any = null;
  /** Pre-fill the search box (e.g. "view all partners for this tier"). */
  @Input() initialSearch = '';

  @Output() close = new EventEmitter<void>();

  search = '';

  ngOnInit(): void {
    this.search = this.initialSearch || '';
  }

  get filteredPartners(): any[] {
    if (!this.tier || !this.tier.partners) return [];
    const q = this.search.trim().toLowerCase();
    if (!q) return this.tier.partners;
    return this.tier.partners.filter((p: any) =>
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.type && p.type.toLowerCase().includes(q)) ||
      (p.contribution && p.contribution.toLowerCase().includes(q)) ||
      (p.beneficiaries && p.beneficiaries.toLowerCase().includes(q)) ||
      (p.status && p.status.toLowerCase().includes(q))
    );
  }

  trackByPartnerName(index: number, partner: any): string {
    return partner ? partner.name : index.toString();
  }

  exportCsv(): void {
    const tier = this.tier;
    if (!tier || !tier.partners || tier.partners.length === 0) return;
    const rows = [
      ['Tier', 'Partner Name', 'Category', 'Contribution & Items', 'Est. Value', 'Beneficiaries', 'ESG Status'],
      ...tier.partners.map((p: any) => [
        tier.badge,
        p.name,
        p.type,
        p.contribution,
        p.valueFormatted || p.value,
        p.beneficiaries,
        p.status
      ])
    ];
    const csv = rows.map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ntic-sponsors-${tier.key}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
