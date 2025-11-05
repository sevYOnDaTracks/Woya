import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'timeAgo',
  standalone: true,
})
export class TimeAgoPipe implements PipeTransform {

  transform(timestamp: number): string {
    if (!timestamp) return '';

    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000); // secondes

    if (diff < 60) return "à l'instant";

    const minutes = Math.floor(diff / 60);
    if (minutes < 60) return `il y a ${minutes} min`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours} h`;

    const days = Math.floor(hours / 24);
    if (days === 1) return "hier";
    if (days < 7) return `il y a ${days} j`;

    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `il y a ${weeks} sem`;

    const months = Math.floor(days / 30);
    if (months < 12) return `il y a ${months} mois`;

    const years = Math.floor(days / 365);
    return `il y a ${years} an${years > 1 ? 's' : ''}`;
  }
}
